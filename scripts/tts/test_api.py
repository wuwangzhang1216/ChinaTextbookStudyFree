"""DashScope Qwen3-TTS API 一条冒烟测试"""
import os
from dotenv import load_dotenv
load_dotenv()
import dashscope

print("key:", (os.getenv("DASHSCOPE_API_KEY") or "")[:8] + "...")

resp = dashscope.MultiModalConversation.call(
    model="qwen3-tts-flash",
    api_key=os.getenv("DASHSCOPE_API_KEY"),
    text="同学们好，今天我们来学习加法运算。",
    voice="Cherry",
    language_type="Chinese",
)
print("status_code:", resp.status_code)
print("request_id:", getattr(resp, "request_id", None))
print("output:", resp.output if resp.status_code == 200 else resp.message)
