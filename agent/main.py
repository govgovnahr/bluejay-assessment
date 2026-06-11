import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from llama_index.core import (
    StorageContext,
    VectorStoreIndex,
    load_index_from_storage,
)
from llama_index.core.schema import MetadataMode
from llama_index.readers.file import PyMuPDFReader

from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    AutoSubscribe,
    JobContext,
    RunContext,
    TurnHandlingOptions,
    cli,
    llm,
)
from livekit.agents.llm import function_tool
from livekit.plugins import deepgram, openai, silero
from livekit.plugins.turn_detector.multilingual import MultilingualModel

from prompts import SYSTEM_PROMPT

load_dotenv(dotenv_path=Path(__file__).parent / ".env")

logger = logging.getLogger("quartermaster")

THIS_DIR = Path(__file__).parent
PDF_PATH = THIS_DIR.parent / "frontend" / "public" / "cfpb-guide.pdf"
PERSIST_DIR = THIS_DIR / "data" / "rag_index"


def _build_or_load_index() -> VectorStoreIndex:
    if PERSIST_DIR.exists() and any(PERSIST_DIR.iterdir()):
        logger.info("Loading existing RAG index from disk")
        storage_context = StorageContext.from_defaults(persist_dir=str(PERSIST_DIR))
        return load_index_from_storage(storage_context)

    logger.info("Building RAG index from PDF — this takes ~30 seconds on first run")
    documents = PyMuPDFReader().load(file_path=PDF_PATH)
    index = VectorStoreIndex.from_documents(documents, show_progress=True)
    PERSIST_DIR.mkdir(parents=True, exist_ok=True)
    index.storage_context.persist(persist_dir=str(PERSIST_DIR))
    logger.info("RAG index built and persisted to disk")
    return index


_index: VectorStoreIndex | None = None
_index_lock: "asyncio.Lock | None" = None


async def aget_index() -> VectorStoreIndex:
    import asyncio
    global _index, _index_lock
    if _index is not None:
        return _index
    if _index_lock is None:
        _index_lock = asyncio.Lock()
    async with _index_lock:
        if _index is None:
            _index = await asyncio.get_event_loop().run_in_executor(None, _build_or_load_index)
    return _index


class QuartermasterAgent(Agent):
    def __init__(self) -> None:
        super().__init__(
            instructions=SYSTEM_PROMPT,
            stt=deepgram.STT(model="nova-2"),
            llm=openai.LLM(model="gpt-4o"),
            tts=openai.TTS(voice="onyx", speed=1.2),
            vad=silero.VAD.load(),
        )

    async def on_enter(self) -> None:
        import asyncio
        await asyncio.sleep(2)  # let Deepgram STT connection warm up before greeting
        self.session.say(
            "Soldier. Quartermaster reporting. "
            "I have reviewed your financial deployment. "
            "Monthly burn rate: thirteen hundred dollars. "
            "Food at four eighty and shopping at three ten are your worst offenders. "
            "State your objective.",
            allow_interruptions=True,
        )

    @function_tool
    async def get_spending_summary(self, context: RunContext) -> str:
        """Call this at the start of every session and whenever the soldier asks about their spending.
        Returns their current monthly spending breakdown by category."""
        data = {
            "food_and_dining": 480,
            "subscriptions": 127,
            "entertainment": 200,
            "transportation": 95,
            "shopping": 310,
            "utilities": 88,
        }
        total = sum(data.values())
        lines = "\n".join(
            f"  {k.replace('_', ' ').title()}: ${v}" for k, v in data.items()
        )
        return f"Monthly spending total: ${total}\n{lines}"

    async def llm_node(
        self,
        chat_ctx: llm.ChatContext,
        tools: list[llm.FunctionTool],
        model_settings,
    ):
        chat_ctx.truncate(max_items=20)  # system + last 10 exchanges
        user_messages = [
            item
            for item in chat_ctx.items
            if isinstance(item, llm.ChatMessage) and item.role == "user"
        ]
        if user_messages:
            query = user_messages[-1].text_content or ""
            if query.strip():
                index = await aget_index()
                retriever = index.as_retriever(similarity_top_k=3)
                nodes = await retriever.aretrieve(query)
                if nodes:
                    parts = []
                    for node in nodes:
                        page = node.metadata.get("source", "?")
                        text = node.get_content(metadata_mode=MetadataMode.NONE).strip()
                        parts.append(f"[Field Manual p.{page}]\n{text}")
                    passages = "\n\n---\n\n".join(parts)
                    injected = (
                        f"\n\nRelevant passages retrieved from the CFPB Field Manual "
                        f"(cite the page number if you reference it, do not invent section names):\n{passages}"
                    )
                    system_msg = next(
                        (
                            item
                            for item in chat_ctx.items
                            if isinstance(item, llm.ChatMessage)
                            and item.role == "system"
                        ),
                        None,
                    )
                    if system_msg:
                        system_msg.content.append(injected)

        return Agent.default.llm_node(self, chat_ctx, tools, model_settings)


server = AgentServer()


@server.rtc_session()
async def entrypoint(ctx: JobContext) -> None:
    ctx.log_context_fields = {"room": ctx.room.name}
    logger.info("job started, connecting to room")
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)
    import asyncio
    asyncio.create_task(aget_index())  # start loading in background, don't block session start
    session = AgentSession(
        turn_handling=TurnHandlingOptions(
            turn_detection=MultilingualModel(),
            endpointing={"min_delay": 0.4},
            preemptive_generation={"preemptive_tts": True},
        ),
    )
    await session.start(agent=QuartermasterAgent(), room=ctx.room)
    logger.info("session started")


if __name__ == "__main__":
    cli.run_app(server)
