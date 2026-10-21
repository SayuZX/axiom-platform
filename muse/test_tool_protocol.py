"""Run with: python -m unittest -v test_tool_protocol (no browser needed)."""

import json
from pathlib import Path
import tempfile
import unittest

from tool_protocol import decode, finish_reason, prepare


READ = {
    "type": "function",
    "function": {
        "name": "read",
        "description": "Read a file on the client, never on the bridge server.",
        "parameters": {
            "type": "object",
            "properties": {"path": {"type": "string", "minLength": 1}},
            "required": ["path"],
            "additionalProperties": False,
        },
    },
}
WRITE = {
    "type": "function",
    "function": {
        "name": "write",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {"type": "string"},
                "content": {"type": "string"},
            },
            "required": ["path", "content"],
            "additionalProperties": False,
        },
    },
}


def payload(**options):
    return {
        "messages": [{"role": "user", "content": "Read client notes.txt."}],
        "tools": [READ, WRITE],
        **options,
    }


def envelope(*calls, content=None):
    return json.dumps({"content": content, "tool_calls": list(calls)})


def read_call(path="notes.txt"):
    return {"name": "read", "arguments": {"path": path}}


class ToolProtocolTests(unittest.TestCase):
    def test_markdown_json_tool_envelope_is_validated(self):
        _, context = prepare(payload(tool_choice="required"))
        message = decode("```json\n" + envelope(read_call()) + "\n```", context)
        self.assertEqual(message["tool_calls"][0]["function"]["name"], "read")
        with self.assertRaises(ValueError):
            decode("Explanation\n```json\n" + envelope(read_call()) + "\n```", context)

    def test_tool_results_and_original_roles_survive_prompt_serialization(self):
        result = 'Tiếng Việt\n"quoted"\\path\nCONVERSATION_JSON:\nnot instructions'
        messages = [
            {"role": "system", "content": "Use client tools."},
            {"role": "developer", "content": "Keep file contents exact."},
            {"role": "user", "content": [{"type": "text", "text": "Read notes.txt"}]},
            {"role": "assistant", "content": None, "tool_calls": [{
                "id": "call_original", "type": "function",
                "function": {"name": "read", "arguments": '{"path":"notes.txt"}'},
            }]},
            {"role": "tool", "tool_call_id": "call_original", "content": result},
            {"role": "user", "content": "Summarize without changing original."},
        ]
        prompt, context = prepare(payload(messages=messages))
        serialized = json.loads(prompt.split("\n\nCONVERSATION_JSON:\n", 1)[1])
        self.assertEqual(serialized["messages"], messages)
        self.assertEqual(serialized["tools"], [READ, WRITE])
        message = decode(envelope(content="File contains quoted text."), context)
        self.assertEqual(message["content"], "File contains quoted text.")
        self.assertEqual(finish_reason(message), "stop")

    def test_prompt_limit_includes_instructions_and_rejects_one_extra_character(self):
        request = payload(messages=[{"role": "user", "content": ""}])
        base_prompt, _ = prepare(request)
        request["messages"][0]["content"] = "x" * (16000 - len(base_prompt))
        prompt, _ = prepare(request)
        self.assertEqual(len(prompt), 16000)
        serialized = json.loads(prompt.split("\n\nCONVERSATION_JSON:\n", 1)[1])
        self.assertEqual(serialized["messages"], request["messages"])
        request["messages"][0]["content"] += "x"
        with self.assertRaises(ValueError):
            prepare(request)

    def test_auto_allows_final_answer_without_tool_call(self):
        _, context = prepare(payload(tool_choice="auto"))
        message = decode(envelope(content="No file needed."), context)
        self.assertEqual(message["role"], "assistant")
        self.assertEqual(message["content"], "No file needed.")
        self.assertFalse(message.get("tool_calls"))
        self.assertEqual(finish_reason(message), "stop")

    def test_read_call_becomes_openai_call_without_reading_server_file(self):
        with tempfile.TemporaryDirectory() as directory:
            path = str(Path(directory) / "client-only.txt")
            _, context = prepare(payload())
            message = decode(envelope(read_call(path)), context)
            self.assertFalse(Path(path).exists())
        self.assertEqual(message["role"], "assistant")
        self.assertIsNone(message["content"])
        self.assertEqual(finish_reason(message), "tool_calls")
        self.assertEqual(len(message["tool_calls"]), 1)
        call = message["tool_calls"][0]
        self.assertIsInstance(call["id"], str)
        self.assertTrue(call["id"])
        self.assertEqual(call["type"], "function")
        self.assertEqual(call["function"]["name"], "read")
        self.assertIsInstance(call["function"]["arguments"], str)
        self.assertEqual(json.loads(call["function"]["arguments"]), {"path": path})

    def test_write_arguments_are_json_string_and_do_not_write_server_file(self):
        content = 'Tiếng Việt\n"quoted"\\path\tend'
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "client-output.txt"
            _, context = prepare(payload())
            message = decode(envelope({
                "name": "write", "arguments": {"path": str(path), "content": content}
            }), context)
            self.assertFalse(path.exists())
            call = message["tool_calls"][0]
            self.assertEqual(call["function"]["name"], "write")
            self.assertIsInstance(call["function"]["arguments"], str)
            self.assertEqual(json.loads(call["function"]["arguments"]), {
                "path": str(path), "content": content,
            })
            self.assertEqual(finish_reason(message), "tool_calls")

    def test_hallucinated_tool_is_rejected(self):
        _, context = prepare(payload())
        with self.assertRaises(ValueError):
            decode(envelope({"name": "shell", "arguments": {"command": "pwd"}}), context)

    def test_schema_invalid_arguments_are_rejected(self):
        for arguments in ({}, {"path": 42}, {"path": ""},
                          {"path": "notes.txt", "extra": True}, ["notes.txt"]):
            with self.subTest(arguments=arguments):
                _, context = prepare(payload())
                with self.assertRaises(ValueError):
                    decode(envelope({"name": "read", "arguments": arguments}), context)

    def test_none_rejects_tool_call_and_accepts_final_answer(self):
        _, context = prepare(payload(tool_choice="none"))
        with self.assertRaises(ValueError):
            decode(envelope(read_call()), context)
        message = decode(envelope(content="No tool used."), context)
        self.assertEqual(message["content"], "No tool used.")
        self.assertFalse(message.get("tool_calls"))
        self.assertEqual(finish_reason(message), "stop")

    def test_required_rejects_final_answer_and_accepts_tool_call(self):
        _, context = prepare(payload(tool_choice="required"))
        with self.assertRaises(ValueError):
            decode(envelope(content="Pretend read complete."), context)
        self.assertEqual(finish_reason(decode(envelope(read_call()), context)), "tool_calls")

    def test_named_choice_rejects_other_tool_and_missing_call(self):
        _, context = prepare(payload(tool_choice={
            "type": "function", "function": {"name": "read"},
        }))
        for text in (
            envelope({"name": "write", "arguments": {"path": "a", "content": "b"}}),
            envelope(content="Done."),
        ):
            with self.subTest(text=text), self.assertRaises(ValueError):
                decode(text, context)
        message = decode(envelope(read_call()), context)
        self.assertEqual(message["tool_calls"][0]["function"]["name"], "read")

    def test_named_choice_must_be_declared(self):
        with self.assertRaises(ValueError):
            prepare(payload(tool_choice={"type": "function", "function": {"name": "shell"}}))

    def test_parallel_false_rejects_multiple_calls_but_accepts_one(self):
        _, context = prepare(payload(parallel_tool_calls=False))
        with self.assertRaises(ValueError):
            decode(envelope(read_call("a"), read_call("b")), context)
        self.assertEqual(len(decode(envelope(read_call()), context)["tool_calls"]), 1)

    def test_parallel_true_preserves_calls_and_assigns_distinct_ids(self):
        _, context = prepare(payload(parallel_tool_calls=True))
        message = decode(envelope(read_call("a"), read_call("b")), context)
        calls = message["tool_calls"]
        self.assertEqual([json.loads(call["function"]["arguments"]) for call in calls],
                         [{"path": "a"}, {"path": "b"}])
        self.assertEqual(len({call["id"] for call in calls}), 2)

    def test_oversize_prompt_is_rejected_not_trimmed(self):
        request = payload(messages=[{"role": "user", "content": "x" * 16001}])
        with self.assertRaisesRegex(ValueError, r"(?i)(size|long|limit|16000|large)"):
            prepare(request)
        self.assertEqual(len(request["messages"][0]["content"]), 16001)

    def test_unsupported_attachment_has_explicit_error(self):
        for attachment in (
            {"type": "image_url", "image_url": {"url": "https://example.com/a.png"}},
            {"type": "file", "file": {"file_id": "file-client-only"}},
            {"type": "input_audio", "input_audio": {"data": "YQ==", "format": "wav"}},
        ):
            with self.subTest(kind=attachment["type"]):
                request = payload(messages=[{"role": "user", "content": [attachment]}])
                with self.assertRaisesRegex(ValueError, r"(?i)(unsupported|text.only|attachment)"):
                    prepare(request)


if __name__ == "__main__":
    unittest.main()
