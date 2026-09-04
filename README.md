# STD Summary Reader

A local browser viewer for the uploaded semiconductor test `.std` file. It extracts the readable SEDana/IMAGE metadata and presents it in a summary-sheet layout.

## Run

From this folder, start a static server:

```bash
python3 -m http.server 8000
```

Open <http://localhost:8000>. The bundled `.std` file is loaded automatically when the app is served. Other files can be opened with the file picker.

The current file exposes metadata records reliably and reads the binary trailer counters for total, good, retest, abort, and functional parts. Software and hardware bin record layouts are not yet fully identified, so the app labels those tables as undecoded instead of inventing values.