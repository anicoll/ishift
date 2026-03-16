package main

import (
	"bytes"
	"context"
	"flag"
	"image/png"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/chromedp/chromedp"
	"github.com/orisano/pixelmatch"
)

var update = flag.Bool("update", false, "regenerate golden PNG files")

// fixtureRequest returns a deterministic, representative PDFRequest for snapshot testing.
// Keep this fixture stable — changes to it intentionally invalidate the golden file.
func fixtureRequest() PDFRequest {
	return PDFRequest{
		StartDate: "2024-01-15",
		EndDate:   "2024-01-21",
		Tags: []Tag{
			{ID: "t1", Name: "First Aid", Color: "#e74c3c"},
			{ID: "t2", Name: "Senior", Color: "#2980b9"},
		},
		Shifts: []ShiftType{
			{
				ID:             "s1",
				Name:           "Morning",
				Start:          "07:00",
				End:            "15:00",
				Color:          "#3498db",
				RequiredTagIDs: []string{"t2"},
			},
			{
				ID:             "s2",
				Name:           "Evening",
				Start:          "15:00",
				End:            "23:00",
				Color:          "#2ecc71",
				RequiredTagIDs: []string{"t1"},
			},
			{
				ID:    "s3",
				Name:  "Night",
				Start: "23:00",
				End:   "07:00",
				Color: "#1a1a2e",
			},
		},
		Workers: []Worker{
			{ID: "w1", Name: "Alice Smith", Role: "Staff"},
			{ID: "w2", Name: "Bob Jones", Role: "Senior"},
			{ID: "w3", Name: "Carol White", Role: "Staff"},
		},
		Assignments: []Assignment{
			// Morning shift — Mon
			{ID: "a1", Date: "2024-01-15", ShiftID: "s1", WorkerID: "w2", Notes: ""},
			{ID: "a2", Date: "2024-01-15", ShiftID: "s1", WorkerID: "w3", Notes: "Cover for Alice"},
			// Evening shift — Mon
			{ID: "a3", Date: "2024-01-15", ShiftID: "s2", WorkerID: "w1", Notes: ""},
			// Morning shift — Tue
			{ID: "a4", Date: "2024-01-16", ShiftID: "s1", WorkerID: "w1", Notes: ""},
			// Night shift — Wed (tests dark background → white text)
			{ID: "a5", Date: "2024-01-17", ShiftID: "s3", WorkerID: "w2", Notes: "Check boiler before handover"},
			// Morning shift — Fri (tests long note wrapping)
			{ID: "a6", Date: "2024-01-19", ShiftID: "s1", WorkerID: "w1", Notes: "Mandatory briefing at 07:15 in the main conference room, attendance required"},
			// Evening shift — Sun
			{ID: "a7", Date: "2024-01-21", ShiftID: "s2", WorkerID: "w3", Notes: ""},
		},
	}
}

// pdfToScreenshot renders a PDF via headless Chromium and returns the viewport
// as a PNG-encoded byte slice. The PDF is served over localhost to avoid
// Chrome's file:// security restrictions in CI environments.
func pdfToScreenshot(t *testing.T, pdfBytes []byte) []byte {
	t.Helper()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/pdf")
		w.Write(pdfBytes)
	}))
	defer srv.Close()

	opts := append(chromedp.DefaultExecAllocatorOptions[:],
		chromedp.DisableGPU,
		chromedp.NoSandbox,
		chromedp.WindowSize(1400, 1000),
	)
	allocCtx, cancel := chromedp.NewExecAllocator(context.Background(), opts...)
	defer cancel()

	ctx, cancel := chromedp.NewContext(allocCtx)
	defer cancel()

	var buf []byte
	err := chromedp.Run(ctx,
		chromedp.Navigate(srv.URL),
		// Wait for Chrome's PDF viewer to finish rendering.
		chromedp.Sleep(2*time.Second),
		chromedp.CaptureScreenshot(&buf),
	)
	if err != nil {
		t.Fatalf("chromedp screenshot: %v", err)
	}
	return buf
}

// imagesClose reports whether two PNG byte slices are visually equivalent.
// pixelmatch compares pixels perceptually; threshold 0.1 allows minor
// anti-aliasing differences. Up to maxDiffPct% of pixels may differ.
func imagesClose(a, b []byte, maxDiffPct float64) (bool, error) {
	imgA, err := png.Decode(bytes.NewReader(a))
	if err != nil {
		return false, err
	}
	imgB, err := png.Decode(bytes.NewReader(b))
	if err != nil {
		return false, err
	}

	bounds := imgA.Bounds()
	if bounds != imgB.Bounds() {
		return false, nil
	}

	diffCount, err := pixelmatch.MatchPixel(imgA, imgB, pixelmatch.Threshold(0.1))
	if err != nil {
		return false, err
	}

	pct := float64(diffCount) / float64(bounds.Dx()*bounds.Dy()) * 100
	return pct <= maxDiffPct, nil
}

func TestGoldenPDF(t *testing.T) {
	got, err := generateSchedulePDF(fixtureRequest())
	if err != nil {
		t.Fatalf("generateSchedulePDF: %v", err)
	}

	screenshot := pdfToScreenshot(t, got)

	const goldenPath = "testdata/golden.png"

	if *update {
		if err := os.MkdirAll("testdata", 0o755); err != nil {
			t.Fatalf("mkdir testdata: %v", err)
		}
		if err := os.WriteFile(goldenPath, screenshot, 0o644); err != nil {
			t.Fatalf("write golden: %v", err)
		}
		t.Logf("golden file updated: %s", goldenPath)
		return
	}

	want, err := os.ReadFile(goldenPath)
	if err != nil {
		t.Fatalf("golden file missing — run `go test ./wasm/... -update` to create it: %v", err)
	}

	// Allow up to 2% of pixels to differ by more than 5/255 per channel
	// to tolerate minor anti-aliasing variation across Chrome versions.
	ok, err := imagesClose(screenshot, want, 2.0)
	if err != nil {
		t.Fatalf("image comparison: %v", err)
	}
	if !ok {
		t.Errorf(
			"PDF screenshot does not match golden file %s\n"+
				"If this change is intentional, run: go test ./wasm/... -update",
			goldenPath,
		)
	}
}
