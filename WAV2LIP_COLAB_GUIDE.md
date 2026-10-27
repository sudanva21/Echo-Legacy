# 🎬 Free Wav2Lip Colab Setup Guide

You can run photorealistic lip-sync video generation for all 5 characters using **Google Colab's Free T4 GPU**.

---

## 🚀 1-Click Code for Your Colab Notebook

Open your notebook: **[colab.research.google.com/drive/1gDa1UemJ5DwZtdK9NPtkMqeECgGVH_PK](https://colab.research.google.com/drive/1gDa1UemJ5DwZtdK9NPtkMqeECgGVH_PK)**

Paste the following code into the code cell and press **Shift + Enter** (or click the **Play ▶️** button):

```python
# ==============================================================================
# EchoLegacy — High-Speed Wav2Lip Animation Server for Google Colab (Free T4 GPU)
# ==============================================================================

# 1. Clone repository & install dependencies
!git clone https://github.com/Rudrabha/Wav2Lip.git /content/Wav2Lip
%cd /content/Wav2Lip
!pip install -q fastapi uvicorn pycloudflared python-multipart requests librosa==0.9.2

# 2. Download pre-trained GAN checkpoint & face detector
!mkdir -p checkpoints face_detection/detection/sfd
!wget -q -O checkpoints/wav2lip_gan.pth https://huggingface.co/Akash07/Wav2Lip/resolve/main/wav2lip_gan.pth
!wget -q -O face_detection/detection/sfd/s3fd.pth https://www.adrianbulat.com/downloads/python-fan/s3fd-619a316842.pth

# 3. Create FastAPI Animation Server
import os, base64, urllib.request, subprocess, time
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import uvicorn
from pycloudflared import try_cloudflare

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs("/content/Wav2Lip/static", exist_ok=True)
app.mount("/static", StaticFiles(directory="/content/Wav2Lip/static"), name="static")

# High-resolution character face portraits matching EchoLegacy
CHARACTER_FACES = {
    "osho": "https://upload.wikimedia.org/wikipedia/commons/3/33/Osho_in_his_library_1.jpg",
    "bhagat_singh": "https://upload.wikimedia.org/wikipedia/commons/5/54/Bhagat_Singh_1929.jpg",
    "ssr": "https://upload.wikimedia.org/wikipedia/commons/d/dd/Sushant_Singh_Rajput_in_2019.jpg",
    "tesla": "https://upload.wikimedia.org/wikipedia/commons/7/79/Tesla_circa_1890.jpeg",
    "hitler": "https://upload.wikimedia.org/wikipedia/commons/e/e1/Hitler_portrait_crop.jpg"
}

public_url = ""

class AnimateRequest(BaseModel):
    audio_url: str
    character_id: str = "osho"

@app.get("/")
def health():
    return {"status": "ready", "service": "EchoLegacy Wav2Lip Animation Server"}

@app.post("/animate")
async def animate(req: AnimateRequest):
    try:
        t_id = int(time.time() * 1000)
        # 1. Download/Cache character face image
        face_url = CHARACTER_FACES.get(req.character_id, CHARACTER_FACES["osho"])
        face_path = f"/content/Wav2Lip/static/{req.character_id}.jpg"
        if not os.path.exists(face_path):
            urllib.request.urlretrieve(face_url, face_path)

        # 2. Extract and save synthesized audio
        audio_path = f"/content/Wav2Lip/static/input_{req.character_id}_{t_id}.wav"
        if req.audio_url.startswith("data:audio"):
            b64 = req.audio_url.split(",")[1]
            with open(audio_path, "wb") as f:
                f.write(base64.b64decode(b64))
        else:
            urllib.request.urlretrieve(req.audio_url, audio_path)

        # 3. Run Wav2Lip inference on GPU
        out_video_name = f"{req.character_id}_{t_id}.mp4"
        out_video_path = f"/content/Wav2Lip/static/{out_video_name}"
        
        cmd = [
            "python", "inference.py",
            "--checkpoint_path", "checkpoints/wav2lip_gan.pth",
            "--face", face_path,
            "--audio", audio_path,
            "--outfile", out_video_path,
            "--nosmooth",
            "--pads", "0", "10", "0", "0"
        ]
        
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if res.returncode != 0:
            print("[Wav2Lip] Error:", res.stderr)
            raise HTTPException(status_code=500, detail="Inference failed")

        video_url = f"{public_url}/static/{out_video_name}"
        print(f"[Wav2Lip] Generated video for {req.character_id}: {video_url}")
        return {"video_url": video_url}

    except Exception as e:
        print("[Wav2Lip] Exception:", str(e))
        raise HTTPException(status_code=500, detail=str(e))

# 4. Start Cloudflare Tunnel (100% Free, No login/token needed!)
tunnel = try_cloudflare(port=8000)
public_url = tunnel.tunnel_url

print("\n" + "="*70)
print("🚀 YOUR LIVE WAV2LIP ANIMATION SERVER IS READY!")
print(f"👉 PUBLIC URL: {public_url}")
print("="*70 + "\n")
print(f"Copy the URL above and set it as NGROK_URL in web/.env.local or Vercel:\nNGROK_URL={public_url}\n")

uvicorn.run(app, host="0.0.0.0", port=8000)
```

---

## 🔗 How to Connect to Your Web App

Once the cell runs, it prints:
```text
🚀 YOUR LIVE WAV2LIP ANIMATION SERVER IS READY!
👉 PUBLIC URL: https://xxxx.trycloudflare.com
```

1. Copy that URL (`https://xxxx.trycloudflare.com`).
2. Add it as an environment variable in **Vercel** (or in `web/.env.local` for local testing):
   ```env
   NGROK_URL=https://xxxx.trycloudflare.com
   ```
3. That's it! When you talk to any character:
   - Voice plays instantly.
   - The video player automatically loads and displays the lip-synced video as soon as Colab renders it!
