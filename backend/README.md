# Backend setup

The backend uses PhoWhisper to transcribe Vietnamese audio.

## Install Python requirements

From the repository root, create and activate a virtual environment, then install
the pinned dependencies:

```powershell
Set-Location backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

On macOS or Linux, activate the environment with:

```bash
source .venv/bin/activate
```

## Install ffmpeg

`ffmpeg` is required for reading and resampling audio files.

On Windows, install it with WinGet:

```powershell
winget install Gyan.FFmpeg.Shared
```

On macOS:

```bash
brew install ffmpeg
```

On Debian or Ubuntu:

```bash
sudo apt update
sudo apt install ffmpeg
```

Verify the installation:

```text
ffmpeg -version
```
