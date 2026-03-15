//go:build js && wasm

package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"sort"
	"syscall/js"
	"time"

	"github.com/go-pdf/fpdf"
)

type Tag struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Color string `json:"color"`
}

type ShiftType struct {
	ID             string   `json:"id"`
	Name           string   `json:"name"`
	Start          string   `json:"start"`
	End            string   `json:"end"`
	Color          string   `json:"color"`
	RequiredTagIDs []string `json:"requiredTagIds"`
}

type Worker struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Role string `json:"role"`
}

type Assignment struct {
	ID       string `json:"id"`
	Date     string `json:"date"`
	ShiftID  string `json:"shiftId"`
	WorkerID string `json:"workerId"`
	Notes    string `json:"notes"`
}

type PDFRequest struct {
	StartDate   string       `json:"startDate"`
	EndDate     string       `json:"endDate"`
	Shifts      []ShiftType  `json:"shifts"`
	Workers     []Worker     `json:"workers"`
	Tags        []Tag        `json:"tags"`
	Assignments []Assignment `json:"assignments"`
}

func eachDayInRange(startDate, endDate string) []string {
	const layout = "2006-01-02"
	start, err := time.Parse(layout, startDate)
	if err != nil {
		return nil
	}
	end, err := time.Parse(layout, endDate)
	if err != nil {
		return nil
	}
	var days []string
	for d := start; !d.After(end); d = d.AddDate(0, 0, 1) {
		days = append(days, d.Format(layout))
	}
	return days
}

func dayLabel(dateStr string) string {
	t, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		return dateStr
	}
	return t.Format("Mon 02 Jan")
}

func hexToRGB(hex string) (r, g, b int) {
	if len(hex) == 0 {
		return 200, 200, 200
	}
	if hex[0] == '#' {
		hex = hex[1:]
	}
	if len(hex) == 3 {
		hex = string([]byte{hex[0], hex[0], hex[1], hex[1], hex[2], hex[2]})
	}
	if len(hex) != 6 {
		return 200, 200, 200
	}
	var rv, gv, bv int
	_, err := fmt.Sscanf(hex, "%02x%02x%02x", &rv, &gv, &bv)
	if err != nil {
		return 200, 200, 200
	}
	return rv, gv, bv
}

func luminance(r, g, b int) float64 {
	return 0.299*float64(r) + 0.587*float64(g) + 0.114*float64(b)
}

type byteWriter struct {
	data []byte
}

func (bw *byteWriter) Write(p []byte) (int, error) {
	bw.data = append(bw.data, p...)
	return len(p), nil
}

func generateSchedulePDF(req PDFRequest) ([]byte, error) {
	days := eachDayInRange(req.StartDate, req.EndDate)
	if len(days) == 0 {
		return nil, fmt.Errorf("invalid date range")
	}

	workerMap := make(map[string]Worker, len(req.Workers))
	for _, w := range req.Workers {
		workerMap[w.ID] = w
	}
	tagMap := make(map[string]Tag, len(req.Tags))
	for _, t := range req.Tags {
		tagMap[t.ID] = t
	}

	type cellKey struct{ date, shiftID string }
	assignMap := make(map[cellKey][]Assignment)
	for _, a := range req.Assignments {
		k := cellKey{a.Date, a.ShiftID}
		assignMap[k] = append(assignMap[k], a)
	}
	for k, list := range assignMap {
		sort.Slice(list, func(i, j int) bool {
			return workerMap[list[i].WorkerID].Name < workerMap[list[j].WorkerID].Name
		})
		assignMap[k] = list
	}

	const (
		marginL   = 10.0
		marginT   = 15.0
		marginR   = 10.0
		pageW     = 297.0
		pageH     = 210.0
		headerH   = 8.0
		rowH      = 5.5
		shiftColW = 34.0
	)

	usableW := pageW - marginL - marginR
	dayColW := (usableW - shiftColW) / float64(len(days))
	if dayColW < 12.0 {
		dayColW = 12.0
	}

	pdf := fpdf.New("L", "mm", "A4", "")
	pdf.SetMargins(marginL, marginT, marginR)
	pdf.SetAutoPageBreak(true, 10)
	pdf.AddPage()

	pdf.SetFont("Helvetica", "B", 13)
	pdf.SetTextColor(30, 30, 30)
	pdf.CellFormat(usableW, 9, fmt.Sprintf("Schedule: %s - %s", dayLabel(req.StartDate), dayLabel(req.EndDate)), "", 1, "L", false, 0, "")
	pdf.Ln(2)

	printHeader := func() {
		pdf.SetFont("Helvetica", "B", 7)
		pdf.SetFillColor(220, 220, 220)
		pdf.SetTextColor(30, 30, 30)
		pdf.SetDrawColor(180, 180, 180)
		pdf.CellFormat(shiftColW, headerH, "Shift", "1", 0, "C", true, 0, "")
		for _, d := range days {
			pdf.CellFormat(dayColW, headerH, dayLabel(d), "1", 0, "C", true, 0, "")
		}
		pdf.Ln(-1)
	}
	printHeader()

	for _, shift := range req.Shifts {
		maxNames := 1
		for _, d := range days {
			k := cellKey{d, shift.ID}
			if n := len(assignMap[k]); n > maxNames {
				maxNames = n
			}
		}
		cellH := float64(maxNames)*rowH + 2.0

		if pdf.GetY()+cellH > pageH-10 {
			pdf.AddPage()
			printHeader()
		}

		startY := pdf.GetY()

		sr, sg, sb := hexToRGB(shift.Color)
		pdf.SetFillColor(sr, sg, sb)
		if luminance(sr, sg, sb) < 128 {
			pdf.SetTextColor(255, 255, 255)
		} else {
			pdf.SetTextColor(30, 30, 30)
		}
		pdf.SetXY(marginL, startY)
		pdf.SetFont("Helvetica", "B", 7)
		pdf.MultiCell(shiftColW, rowH, fmt.Sprintf("%s\n%s-%s", shift.Name, shift.Start, shift.End), "1", "L", true)

		if len(shift.RequiredTagIDs) > 0 {
			pdf.SetFont("Helvetica", "I", 6)
			pdf.SetTextColor(80, 80, 80)
			for _, tid := range shift.RequiredTagIDs {
				if t, ok := tagMap[tid]; ok {
					pdf.SetX(marginL)
					pdf.CellFormat(shiftColW, 4, t.Name, "", 1, "L", false, 0, "")
				}
			}
		}

		pdf.SetFont("Helvetica", "", 7)
		pdf.SetTextColor(30, 30, 30)
		pdf.SetFillColor(255, 255, 255)

		for i, d := range days {
			cellX := marginL + shiftColW + float64(i)*dayColW
			pdf.SetXY(cellX, startY)
			k := cellKey{d, shift.ID}
			names := ""
			for ai, a := range assignMap[k] {
				if ai > 0 {
					names += "\n"
				}
				names += workerMap[a.WorkerID].Name
			}
			pdf.MultiCell(dayColW, rowH, names, "1", "L", false)
		}

		nextY := startY + cellH
		if pdf.GetY() > nextY {
			nextY = pdf.GetY()
		}
		pdf.SetXY(marginL, nextY)
	}

	writer := &byteWriter{}
	if err := pdf.Output(writer); err != nil {
		return nil, err
	}
	return writer.data, nil
}

func jsGeneratePDF(_ js.Value, args []js.Value) interface{} {
	if len(args) < 1 {
		return map[string]interface{}{"error": "missing argument"}
	}
	var req PDFRequest
	if err := json.Unmarshal([]byte(args[0].String()), &req); err != nil {
		return map[string]interface{}{"error": "invalid JSON: " + err.Error()}
	}
	pdfBytes, err := generateSchedulePDF(req)
	if err != nil {
		return map[string]interface{}{"error": err.Error()}
	}
	return map[string]interface{}{
		"data": base64.StdEncoding.EncodeToString(pdfBytes),
	}
}

func main() {
	js.Global().Set("generateSchedulePDF", js.FuncOf(jsGeneratePDF))
	select {}
}
