# 🎬 Free Lip-Sync Setup Guide (Wav2Lip on Free Google Colab)

This guide allows you to run **photorealistic neural lip-sync video generation** for all 5 characters (**Osho, Bhagat Singh, Nikola Tesla, Sushant Singh Rajput, and Adolf Hitler**) using a **100% Free Google Colab T4 GPU**.

---

## ⚡ Architecture Overview

1. **Next.js Web App** generates the response text and authentic cloned voice via Smallest.ai.
2. The web app sends the synthesized audio + character ID to your free **Google Colab server** (`/api/animate` -> `NGROK_URL/animate`).
3. Google Colab runs **Wav2Lip** on its free GPU, creates the synchronized talking head MP4, and returns the video URL.
4. The web player automatically plays the lip-synced video!

---

## 🚀 Step 1: Open Google Colab & Select Free GPU

1. Go to [Google Colab](https://colab.research.google.com/) and create a **New Notebook**.
2. Click **Runtime** → **Change runtime type**.
3. Under **Hardware accelerator**, select **T4 GPU** (Free tier) and click **Save**.

---

## 💻 Step 2: Copy & Run the Colab Server Script

Copy and paste the following Python code into a Colab code cell and click **Run** (▶️):

```python
# ==============================================================================
# EchoLegacy / AI Expo — Free Wav2Lip Neural Animation Server
# ==============================================================================

# 1. Install system tools & libraries
!git clone https://github.com/Rudrabha/Wav2Lip.git
%cd Wav2Lip
!pip install -q fastapi uvicorn pyngrok python-multipart requests

# 2. Download pre-trained Wav2Lip checkpoint
!wget -O "checkpoints/wav2lip_gan.pth" "https://github.com/ox-vgg/vggface2-pytorch/releases/download/v0.1/wav2lip_gan.pth" || \
 wget -O "checkpoints/wav2lip_gan.pth" "https://huggingface.co/Akash07/Wav2Lip/resolve/main/wav2lip_gan.pth"

# 3. Create FastAPI Animation Server
import os, base64, urllib.request, subprocess
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import uvicorn

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

# High-resolution character face references
CHARACTER_FACES = {
    "osho": "https://upload.wikimedia.org/wikipedia/commons/3/33/Osho_in_his_library_1.jpg",
    "bhagat_singh": "https://upload.wikimedia.org/wikipedia/commons/5/54/Bhagat_Singh_1929.jpg",
    "ssr": "https://upload.wikimedia.org/wikipedia/commons/d/dd/Sushant_Singh_Rajput_in_2019.jpg",
    "tesla": "https://upload.wikimedia.org/wikipedia/commons/7/79/Tesla_circa_1890.jpeg",
    "hitler": "https://upload.wikimedia.org/wikipedia/commons/e/e1/Hitler_portrait_crop.jpg"
}

class AnimateRequest(BaseModel):
    audio_url: str
    character_id: str = "osho"

@app.post("/animate")
async def animate(req: AnimateRequest):
    try:
        # Download face image
        face_url = CHARACTER_FACES.get(req.character_id, CHARACTER_FACES["osho"])
        face_path = f"static/{req.character_id}.jpg"
        if not os.path.exists(face_path):
            urllib.request.urlretrieve(face_url, face_path)

        # Save audio from data URL or remote URL
        audio_path = f"static/input_{req.character_id}.wav"
        if req.audio_url.startswith("data:audio"):
            b64 = req.audio_url.split(",")[1]
            with open(audio_path, "wb") as f:
                f.write(base64.b64decode(b64))
        else:
            urllib.request.urlretrieve(req.audio_url, audio_path)

        # Run Wav2Lip inference on GPU
        out_video = f"static/{req.character_id}_talking.mp4"
        cmd = [
            "python", "inference.py",
            "--checkpoint_path", "checkpoints/wav2lip_gan.pth",
            "--face", face_path,
            "--audio", audio_path,
            "--outfile", out_video,
            "--nosmooth"
        ]
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if res.returncode != 0:
            print("Wav2Lip error:", res.stderr)
            raise HTTPException(status_code=500, detail=res.stderr)

        return {"video_url": f"/static/{req.character_id}_talking.mp4"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# 4. Start public tunnel (using pyngrok or localtunnel)
from pyngrok import ngrok
# Sign up for a free token at https://dashboard.ngrok.com/get-started/your-authtoken
ngrok.set_auth_token("YOUR_FREE_NGROK_AUTHTOKEN")
public_url = ngrok.connect(8000).public_url
print("\n" + "="*60)
print(f"🎬 YOUR PUBLIC ANIMATION SERVER URL: {public_url}")
print("="*60 + "\n")

uvicorn.run(app, host="0.0.0.0", port=8000)
```

---

## 🔗 Step 3: Connect to Your Next.js App

1. Copy the printed `public_url` from Colab (e.g. `https://1234-xx-xx.ngrok-free.app`).
2. Add it to your **`web/.env.local`** and **Vercel Environment Variables**:
   ```env
   NGROK_URL=https://1234-xx-xx.ngrok-free.app
   ```
3. That's it! When you ask any character a question:
   - Voice plays instantly with the new **audio-reactive speech equalizer & glow**.
   - As soon as the Colab GPU finishes the video, it smoothly transitions to the **photorealistic lip-synced video**!
