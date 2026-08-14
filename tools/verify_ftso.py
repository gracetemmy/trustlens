"""
Sanity-check FTSOv2 connectivity and feed IDs on Coston2.

Run this before debugging anything else. If it prints live prices, your RPC
path and feed encoding are correct, and any later failure is in the TEE or
contract layer, not the data layer.

    python tools/verify_ftso.py

No third-party dependencies required.
"""
import json
import urllib.request

RPC = "https://coston2-api.flare.network/ext/C/rpc"

# FtsoV2 on Coston2. Prefer resolving via ContractRegistry in production code.
FTSOV2 = "0x3d893C53D9e8056135C26C8c638B76C8b60Df726"

# keccak256("getFeedById(bytes21)")[:4]
SELECTOR = "0x93e9f806"

# Feed IDs: 0x01 (crypto category) + ASCII name, right-padded to 21 bytes.
FEEDS = {
    "XRP/USD": "0x015852502f55534400000000000000000000000000",
    "FLR/USD": "0x01464c522f55534400000000000000000000000000",
    "BTC/USD": "0x014254432f55534400000000000000000000000000",
    "ETH/USD": "0x014554482f55534400000000000000000000000000",
}


def rpc(method: str, params: list):
    payload = json.dumps(
        {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
    ).encode()
    req = urllib.request.Request(
        RPC, data=payload, headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.loads(r.read())


def feed_id_for(name: str) -> str:
    """Derive a 21-byte crypto feed ID from a feed name such as 'XRP/USD'."""
    return "0x" + ("01" + name.encode().hex()).ljust(42, "0")


def read_feed(feed_id: str):
    # bytes21 is left-aligned within its 32-byte word.
    data = SELECTOR + feed_id[2:].ljust(64, "0")
    res = rpc("eth_call", [{"to": FTSOV2, "data": data}, "latest"])
    if "error" in res:
        raise RuntimeError(res["error"])

    raw = res["result"][2:]
    value = int(raw[0:64], 16)
    decimals = int(raw[64:128], 16)
    if decimals > 2**255:  # int8 returned as two's complement
        decimals -= 2**256
    timestamp = int(raw[128:192], 16)
    return value, decimals, timestamp


def main() -> None:
    chain_id = int(rpc("eth_chainId", []).get("result", "0x0"), 16)
    block = int(rpc("eth_blockNumber", []).get("result", "0x0"), 16)
    print(f"chain id : {chain_id} (expected 114 for Coston2)")
    print(f"block    : {block}\n")

    for name, expected_id in FEEDS.items():
        derived = feed_id_for(name)
        assert derived == expected_id, f"{name}: {derived} != {expected_id}"

        value, decimals, ts = read_feed(expected_id)
        price = value / (10**decimals)
        # NOTE: decimals differ per feed (XRP=6, BTC=2, FLR=8). Never assume 18.
        print(f"{name:8s} {price:>14.6f}   raw={value:<12} decimals={decimals}  ts={ts}")


if __name__ == "__main__":
    main()
