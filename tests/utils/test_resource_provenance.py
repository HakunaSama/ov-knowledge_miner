import hashlib
import json
from unittest.mock import AsyncMock

import pytest

import openviking.utils.resource_processor as resource_processor_module
from openviking.utils.resource_processor import ResourceProcessor
from openviking_cli.exceptions import ConflictError


@pytest.mark.asyncio
async def test_preserve_original_source_writes_binary_and_sha256_sidecar(tmp_path, monkeypatch):
    source = tmp_path / "staged.pdf"
    payload = b"%PDF-1.7 original bytes"
    source.write_bytes(payload)
    viking_fs = type(
        "FakeVikingFS",
        (),
        {
            "exists": AsyncMock(return_value=False),
            "read_file": AsyncMock(),
            "write_file_bytes": AsyncMock(),
            "write_file": AsyncMock(),
        },
    )()
    monkeypatch.setattr(resource_processor_module, "get_viking_fs", lambda: viking_fs)

    provenance = await ResourceProcessor._preserve_original_source(
        source_path=str(source),
        root_uri="viking://resources/run/report",
        source_name="../Quarterly Report.pdf",
        source_format="pdf",
        ctx=object(),
        lease_ref={"lease_ref": "test"},
    )

    digest = hashlib.sha256(payload).hexdigest()
    assert provenance == {
        "version": "1.0",
        "document_id": f"sha256:{digest}",
        "original_filename": "Quarterly Report.pdf",
        "original_uri": "viking://resources/run/report/.source/Quarterly Report.pdf",
        "sha256": digest,
        "size_bytes": len(payload),
        "source_format": "pdf",
    }
    viking_fs.write_file_bytes.assert_awaited_once()
    sidecar = json.loads(viking_fs.write_file.await_args.args[1])
    assert sidecar["document_id"] == f"sha256:{digest}"
    assert sidecar["original_uri"].endswith("/.source/Quarterly Report.pdf")


@pytest.mark.asyncio
async def test_preserve_original_source_rejects_different_content_at_same_uri(
    tmp_path, monkeypatch
):
    source = tmp_path / "staged.pdf"
    source.write_bytes(b"%PDF-1.7 replacement bytes")
    viking_fs = type(
        "FakeVikingFS",
        (),
        {
            "exists": AsyncMock(return_value=True),
            "read_file": AsyncMock(return_value=json.dumps({"document_id": "sha256:original"})),
            "write_file_bytes": AsyncMock(),
            "write_file": AsyncMock(),
        },
    )()
    monkeypatch.setattr(resource_processor_module, "get_viking_fs", lambda: viking_fs)

    with pytest.raises(ConflictError, match="Refusing to overwrite"):
        await ResourceProcessor._preserve_original_source(
            source_path=str(source),
            root_uri="viking://resources/run/report",
            source_name=r"..\Quarterly Report.pdf",
            source_format="pdf",
            ctx=object(),
            lease_ref={"lease_ref": "test"},
        )

    viking_fs.write_file_bytes.assert_not_awaited()
    viking_fs.write_file.assert_not_awaited()
