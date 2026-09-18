import asyncio
import edge_tts
import sys

async def main():
    try:
        communicate = edge_tts.Communicate("Hello world this is a test of edge tts.", "en-US-AriaNeural")
        count = 0
        async for chunk in communicate.stream():
            if chunk["type"] == "WordBoundary":
                print(f"WordBoundary: {chunk}")
                count += 1
        print(f"Total word boundaries: {count}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
