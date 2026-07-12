import asyncio, edge_tts, os

VOICE = 'zh-CN-XiaoxiaoNeural'

# edge-tts 免费接口只支持 rate/pitch/volume（不支持 SSML / express-as）
# 情绪全靠 语速 + 音调 + 音量 的组合来演绎，文本只放拟声词
# (文件名, 拟声词, rate, pitch, volume, 中文标签)
lines = [
    ("happy",  "咕咕嘎嘎，咕嘎！",   "+18%",  "+35Hz", "+0%",   "开心·出发"),
    ("win",    "咕咕嘎嘎嘎嘎！",     "+30%",  "+50Hz", "+15%",  "胜利·兴奋"),
    ("lose",   "咕…嘎…",             "-28%",  "-40Hz", "-10%",  "失败·委屈"),
    ("ready",  "咕嘎，咕咕嘎～",     "+8%",   "+25Hz", "+0%",   "就绪·俏皮"),
    ("hit",    "咕嘎！咕嘎！",       "+22%",  "+15Hz", "+5%",   "受击·紧张"),
    ("cute",   "咕咕…嘎嘎…",         "-8%",   "+30Hz", "-3%",   "撒娇·软糯"),
]

async def run():
    for name, text, rate, pitch, vol, label in lines:
        out = f'public/sfx/vo/gugu_{name}.mp3'
        try:
            c = edge_tts.Communicate(text, VOICE, rate=rate, pitch=pitch, volume=vol)
            await c.save(out)
            sz = os.path.getsize(out)
            print(f'OK  {name:6} [{label}] rate={rate} pitch={pitch} vol={vol} -> {sz} bytes')
        except Exception as e:
            print(f'FAIL {name:6} [{label}] {type(e).__name__}: {e}')

asyncio.run(run())
