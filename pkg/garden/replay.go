package garden

import (
	"bytes"
	"encoding/json"
	"io"
)

// Keeping some headroom below the 3 MB replay store also allows for JSONB overhead.
const compactErrorsAt = 2_200_000

// WriteReplay encodes the engine's private transport. An error belongs to a
// seat from the frame where it first stops until the end of the garden.
func WriteReplay(w io.Writer, result Result) error {
	for _, seat := range result.Agents {
		if seat.Error == "" {
			continue
		}
		var data bytes.Buffer
		if err := writeJSON(&data, result); err != nil {
			return err
		}
		if data.Len() <= compactErrorsAt {
			_, err := io.Copy(w, &data)
			return err
		}
		return writeCompactErrors(w, result)
	}
	return writeJSON(w, result)
}

func writeJSON(w io.Writer, value any) error {
	enc := json.NewEncoder(w)
	// This endpoint serves standalone JSON. Literal <, > and & in names are safe.
	enc.SetEscapeHTML(false)
	return enc.Encode(value)
}

func writeCompactErrors(w io.Writer, result Result) error {
	first := make([]int, len(result.Agents))
	for i := range first {
		first[i] = -1
	}
	frames := make([]Frame, len(result.Frames))
	for i, frame := range result.Frames {
		frames[i] = frame
		frames[i].Agents = append([]State(nil), frame.Agents...)
		for j, seat := range frame.Agents {
			if seat.Error == "" {
				continue
			}
			if first[j] == -1 {
				first[j] = i
			}
			frames[i].Agents[j].Error = ""
		}
	}
	result.Frames = frames
	return writeJSON(w, struct {
		Result
		ErrorStarts []int `json:"errorStarts"`
	}{result, first})
}
