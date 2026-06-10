import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from llama_index.core import (
    SimpleDirectoryReader,
    StorageContext,
    VectorStoreIndex,
    load_index_from_storage,
)
from llama_index.core.schema import MetadataMode

from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    AutoSubscribe,
    JobContext,
    RunContext,
    cli,
    llm,
)
from livekit.agents.llm import function_tool
from livekit.plugins import deepgram, elevenlabs, openai, silero

from prompts import SYSTEM_PROMPT

load_dotenv()

logger = logging.getLogger("quartermaster")

THIS_DIR = Path(__file__).parent
PDF_PATH = THIS_DIR.parent / "YOUR MONEY, YOUR GOALS_ A financial empowerment toolkit - cfpb_your-money-your-goals_financial-empowerment_toolkit.pdf"
PERSIST_DIR = THIS_DIR / "data" / "rag_index"


def _build_or_load_index() -> VectorStoreIndex:
    if PERSIST_DIR.exists() and any(PERSIST_DIR.iterdir()):
        logger.info("Loading existing RAG index from disk")
        storage_context = StorageContext.from_defaults(persist_dir=str(PERSIST_DIR))
        return load_index_from_storage(storage_context)

    logger.info("Building RAG index from PDF — this takes ~30 seconds on first run")
    documents = SimpleDirectoryReader(input_files=[str(PDF_PATH)]).load_data()
    index = VectorStoreIndex.from_documents(documents, show_progress=True)
    PERSIST_DIR.mkdir(parents=True, exist_ok=True)
    index.storage_context.persist(persist_dir=str(PERSIST_DIR))
    logger.info("RAG index built and persisted to disk")
    return index


index = _build_or_load_index()


class QuartermasterAgent(Agent):
    def __init__(self) -> None:
        super().__init__(
            instructions=SYSTEM_PROMPT,
            stt=deepgram.STT(model="nova-2"),
            llm=openai.LLM(model="gpt-4o"),
            tts=elevenlabs.TTS(
                voice_id=os.environ["ELEVENLABS_VOICE_ID"],
                model="eleven_turbo_v2_5",
            ),
        )

    async def on_enter(self) -> None:
        self.session.generate_reply(
            instructions=(
                "Call get_spending_summary immediately, then greet the soldier with your rank "
                "and state that you have reviewed their financial situation. Be terse."
            )
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
        # Retrieve relevant passages from the CFPB manual for the last user message
        user_messages = [
            item
            for item in chat_ctx.items
            if isinstance(item, llm.ChatMessage) and item.role == "user"
        ]
        if user_messages:
            query = user_messages[-1].text_content or ""
            if query.strip():
                retriever = index.as_retriever(similarity_top_k=3)
                nodes = await retriever.aretrieve(query)
                if nodes:
                    passages = "\n\n".join(
                        node.get_content(metadata_mode=MetadataMode.LLM)
                        for node in nodes
                    )
                    injected = (
                        f"\n\nRelevant passages from the Financial Field Manual "
                        f"(CFPB Your Money Your Goals):\n{passages}"
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


def prewarm(proc) -> None:
    proc.userdata["vad"] = silero.VAD.load()


server.setup_fnc = prewarm


@server.rtc_session()
async def entrypoint(ctx: JobContext) -> None:
    ctx.log_context_fields = {"room": ctx.room.name}
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

    session = AgentSession(
        vad=ctx.proc.userdata["vad"],
    )
    await session.start(agent=QuartermasterAgent(), room=ctx.room)


if __name__ == "__main__":
    cli.run_app(server)
