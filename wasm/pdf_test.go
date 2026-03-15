package main

import (
	"bytes"
	"flag"
	"os"
	"regexp"
	"testing"
)

var update = flag.Bool("update", false, "regenerate golden PDF files")

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

// pdfDatePattern matches PDF date strings embedded by fpdf so they can be
// normalised before comparison, making the snapshot independent of wall-clock time.
var pdfDatePattern = regexp.MustCompile(`\(D:\d{14}[^)]*\)`)

func normalizePDF(b []byte) []byte {
	return pdfDatePattern.ReplaceAll(b, []byte("(D:00000000000000)"))
}

func TestGoldenPDF(t *testing.T) {
	got, err := generateSchedulePDF(fixtureRequest())
	if err != nil {
		t.Fatalf("generateSchedulePDF: %v", err)
	}
	got = normalizePDF(got)

	const goldenPath = "testdata/golden.pdf"

	if *update {
		if err := os.MkdirAll("testdata", 0o755); err != nil {
			t.Fatalf("mkdir testdata: %v", err)
		}
		if err := os.WriteFile(goldenPath, got, 0o644); err != nil {
			t.Fatalf("write golden: %v", err)
		}
		t.Logf("golden file updated: %s", goldenPath)
		return
	}

	want, err := os.ReadFile(goldenPath)
	if err != nil {
		t.Fatalf("golden file missing — run `go test -update` to create it: %v", err)
	}
	want = normalizePDF(want)

	if !bytes.Equal(got, want) {
		t.Errorf(
			"PDF output does not match golden file %s\n"+
				"If this change is intentional, run: go test ./wasm/... -update",
			goldenPath,
		)
	}
}
