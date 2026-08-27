from vikingbot.compile.read_depth import distributed_probe_indexes, required_probe_count


def test_required_probe_count_scales_with_document_size():
    assert required_probe_count(0) == 0
    assert required_probe_count(8) == 8
    assert required_probe_count(9) == 9
    assert required_probe_count(24) == 12
    assert required_probe_count(25) == 16
    assert required_probe_count(58) == 16
    assert required_probe_count(65) == 24


def test_distributed_probes_include_head_exact_middle_and_tail():
    for fragment_count in (9, 20, 58, 100):
        indexes = distributed_probe_indexes(fragment_count)
        assert indexes[0] == 0
        assert fragment_count // 2 in indexes
        assert indexes[-1] == fragment_count - 1
        assert len(indexes) == required_probe_count(fragment_count)
