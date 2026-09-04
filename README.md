# STD Summary Reader

A local browser viewer for the uploaded semiconductor test `.std` file. It extracts the readable SEDana/IMAGE metadata and presents it in a summary-sheet layout.

## Run

From this folder, start a static server:

```bash
python3 -m http.server 8000
```

Open <http://localhost:8000>. The bundled `.std` file is loaded automatically when the app is served. Other files can be opened with the file picker.

The reader exposes metadata, binary trailer counters, and the embedded software-bin (`0x32`) and hardware-bin (`0x28`) records. It runs entirely in the browser; files are not uploaded to a server.