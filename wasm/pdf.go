package main

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/go-pdf/fpdf"
)

// Tag represents a label that can be required by a shift.
type Tag struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Color string `json:"color"`
}

// ShiftType describes a shift template.
type ShiftType struct {
	ID             string   `json:"id"`
	Name           string   `json:"name"`
	Start          string   `json:"start"`
	End            string   `json:"end"`
	Color          string   `json:"color"`
	RequiredTagIDs []string `json:"requiredTagIds"`
}

// Worker represents a staff member.
type Worker struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Role string `json:"role"`
}

// Assignment links a worker to a shift on a specific date.
type Assignment struct {
	ID       string `json:"id"`
	Date     string `json:"date"`
	ShiftID  string `json:"shiftId"`
	WorkerID string `json:"workerId"`
	Notes    string `json:"notes"`
}

// PDFRequest is the top-level input to generateSchedulePDF.
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

// truncateToWidth trims text with an ellipsis so it fits within maxW mm at the current font.
func truncateToWidth(pdf *fpdf.Fpdf, text string, maxW float64) string {
	if pdf.GetStringWidth(text) <= maxW {
		return text
	}
	ellipsis := "…"
	runes := []rune(text)
	for len(runes) > 0 {
		runes = runes[:len(runes)-1]
		if pdf.GetStringWidth(string(runes)+ellipsis) <= maxW {
			return string(runes) + ellipsis
		}
	}
	return ellipsis
}

// breakWord splits a single word into chunks that each fit within maxW mm.
func breakWord(pdf *fpdf.Fpdf, word string, maxW float64) []string {
	var chunks []string
	runes := []rune(word)
	current := ""
	for _, r := range runes {
		candidate := current + string(r)
		if pdf.GetStringWidth(candidate) <= maxW {
			current = candidate
		} else {
			if current != "" {
				chunks = append(chunks, current)
			}
			current = string(r)
		}
	}
	if current != "" {
		chunks = append(chunks, current)
	}
	return chunks
}

// wrapText word-wraps text into lines that each fit within maxW mm at the current font.
// Falls back to character-level breaking for words wider than maxW.
func wrapText(pdf *fpdf.Fpdf, text string, maxW float64) []string {
	words := strings.Fields(text)
	if len(words) == 0 {
		return nil
	}
	var lines []string
	current := ""
	for _, word := range words {
		// If the word alone is too wide, flush current line and break the word
		if pdf.GetStringWidth(word) > maxW {
			if current != "" {
				lines = append(lines, current)
				current = ""
			}
			chunks := breakWord(pdf, word, maxW)
			lines = append(lines, chunks[:len(chunks)-1]...)
			current = chunks[len(chunks)-1]
			continue
		}
		candidate := word
		if current != "" {
			candidate = current + " " + word
		}
		if pdf.GetStringWidth(candidate) <= maxW {
			current = candidate
		} else {
			lines = append(lines, current)
			current = word
		}
	}
	if current != "" {
		lines = append(lines, current)
	}
	return lines
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
		marginL     = 10.0
		marginT     = 15.0
		marginR     = 10.0
		pageW       = 297.0
		pageH       = 210.0
		headerH     = 8.0
		nameH       = 5.5 // shift name line height
		timeH       = 4.5 // shift time line height
		tagH        = 4.0 // tag line height
		workerLineH = 5.0 // worker name line height
		notesLineH  = 4.0 // notes line height per wrapped line
		padV        = 1.5 // vertical padding inside cells
		shiftColW   = 38.0
	)

	type entryInfo struct {
		a         Assignment
		noteLines []string
		height    float64 // workerLineH + len(noteLines)*notesLineH
	}

	usableW := pageW - marginL - marginR
	dayColW := (usableW - shiftColW) / float64(len(days))
	if dayColW < 12.0 {
		dayColW = 12.0
	}

	pdf := fpdf.New("L", "mm", "A4", "")
	pdf.SetMargins(marginL, marginT, marginR)
	pdf.SetAutoPageBreak(false, 0)
	pdf.AddPage()

	pdf.SetFont("Helvetica", "B", 13)
	pdf.SetTextColor(30, 30, 30)
	pdf.CellFormat(usableW, 9, fmt.Sprintf("Schedule: %s - %s", dayLabel(req.StartDate), dayLabel(req.EndDate)), "", 1, "L", false, 0, "")
	pdf.Ln(2)

	printHeader := func() {
		pdf.SetFont("Helvetica", "B", 7)
		pdf.SetFillColor(220, 220, 220)
		pdf.SetTextColor(30, 30, 30)
		pdf.SetDrawColor(160, 160, 160)
		pdf.CellFormat(shiftColW, headerH, "Shift", "1", 0, "C", true, 0, "")
		for _, d := range days {
			pdf.CellFormat(dayColW, headerH, dayLabel(d), "1", 0, "C", true, 0, "")
		}
		pdf.Ln(-1)
	}
	printHeader()

	for _, shift := range req.Shifts {
		// Pre-compute wrapped note lines per assignment (needs notes font for width measurement)
		pdf.SetFont("Helvetica", "I", 5.5)
		cellEntries := make(map[cellKey][]entryInfo)
		for _, d := range days {
			k := cellKey{d, shift.ID}
			var entries []entryInfo
			for _, a := range assignMap[k] {
				var noteLines []string
				if a.Notes != "" {
					noteLines = wrapText(pdf, a.Notes, dayColW-2)
				}
				entries = append(entries, entryInfo{
					a:         a,
					noteLines: noteLines,
					height:    workerLineH + float64(len(noteLines))*notesLineH,
				})
			}
			cellEntries[k] = entries
		}

		// Height needed by the shift label cell
		shiftLabelH := padV + nameH + timeH + float64(len(shift.RequiredTagIDs))*tagH + padV

		// Height needed by the tallest worker cell (minimum: one empty entry)
		workerCellH := padV + workerLineH + padV
		for _, d := range days {
			h := padV
			for _, e := range cellEntries[cellKey{d, shift.ID}] {
				h += e.height
			}
			h += padV
			if h > workerCellH {
				workerCellH = h
			}
		}

		cellH := shiftLabelH
		if workerCellH > cellH {
			cellH = workerCellH
		}

		// Page break
		if pdf.GetY()+cellH > pageH-10 {
			pdf.AddPage()
			printHeader()
		}

		startY := pdf.GetY()
		sr, sg, sb := hexToRGB(shift.Color)

		// ── shift label cell ──────────────────────────────────────────────────
		pdf.SetDrawColor(160, 160, 160)
		pdf.SetFillColor(sr, sg, sb)
		pdf.Rect(marginL, startY, shiftColW, cellH, "FD")

		var textR, textG, textB int
		if luminance(sr, sg, sb) < 128 {
			textR, textG, textB = 255, 255, 255
		} else {
			textR, textG, textB = 30, 30, 30
		}

		// Shift name (bold)
		pdf.SetFont("Helvetica", "B", 7)
		pdf.SetTextColor(textR, textG, textB)
		pdf.SetXY(marginL+1, startY+padV)
		pdf.CellFormat(shiftColW-2, nameH, shift.Name, "", 0, "L", false, 0, "")

		// Time range
		pdf.SetFont("Helvetica", "", 6)
		pdf.SetTextColor(textR, textG, textB)
		pdf.SetXY(marginL+1, startY+padV+nameH)
		pdf.CellFormat(shiftColW-2, timeH, shift.Start+"-"+shift.End, "", 0, "L", false, 0, "")

		// Required tags
		pdf.SetFont("Helvetica", "I", 6)
		pdf.SetTextColor(textR, textG, textB)
		for ti, tid := range shift.RequiredTagIDs {
			if t, ok := tagMap[tid]; ok {
				pdf.SetXY(marginL+1, startY+padV+nameH+timeH+float64(ti)*tagH)
				pdf.CellFormat(shiftColW-2, tagH, t.Name, "", 0, "L", false, 0, "")
			}
		}

		// ── day worker cells ──────────────────────────────────────────────────
		pdf.SetFillColor(255, 255, 255)
		pdf.SetDrawColor(160, 160, 160)

		for i, d := range days {
			cellX := marginL + shiftColW + float64(i)*dayColW
			pdf.Rect(cellX, startY, dayColW, cellH, "D")

			y := startY + padV
			for _, entry := range cellEntries[cellKey{d, shift.ID}] {
				// Worker name
				pdf.SetFont("Helvetica", "", 7)
				pdf.SetTextColor(30, 30, 30)
				pdf.SetXY(cellX+1, y)
				pdf.CellFormat(dayColW-2, workerLineH, truncateToWidth(pdf, workerMap[entry.a.WorkerID].Name, dayColW-2), "", 0, "L", false, 0, "")
				y += workerLineH
				// Wrapped note lines
				if len(entry.noteLines) > 0 {
					pdf.SetFont("Helvetica", "I", 5.5)
					pdf.SetTextColor(90, 90, 90)
					for _, line := range entry.noteLines {
						pdf.SetXY(cellX+1, y)
						pdf.CellFormat(dayColW-2, notesLineH, line, "", 0, "L", false, 0, "")
						y += notesLineH
					}
				}
			}
		}

		pdf.SetXY(marginL, startY+cellH)
	}

	// Footer credit on each page
	for i := 1; i <= pdf.PageCount(); i++ {
		pdf.SetPage(i)
		pdf.SetFont("Helvetica", "", 6)
		pdf.SetTextColor(160, 160, 160)
		pdf.SetXY(marginL, pageH-6)
		pdf.CellFormat(usableW, 5, "github.com/anicoll/ishift", "", 0, "R", false, 0, "")
	}

	writer := &byteWriter{}
	if err := pdf.Output(writer); err != nil {
		return nil, err
	}
	return writer.data, nil
}
