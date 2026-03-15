//go:build js && wasm

package main

import (
	"encoding/base64"
	"encoding/json"
	"syscall/js"
)

func jsGeneratePDF(_ js.Value, args []js.Value) any {
	if len(args) < 1 {
		return map[string]any{"error": "missing argument"}
	}
	var req PDFRequest
	if err := json.Unmarshal([]byte(args[0].String()), &req); err != nil {
		return map[string]any{"error": "invalid JSON: " + err.Error()}
	}
	pdfBytes, err := generateSchedulePDF(req)
	if err != nil {
		return map[string]any{"error": err.Error()}
	}
	return map[string]any{
		"data": base64.StdEncoding.EncodeToString(pdfBytes),
	}
}

func main() {
	js.Global().Set("generateSchedulePDF", js.FuncOf(jsGeneratePDF))
	select {}
}
