# Canonical MurmurHash2 (Austin Appleby), 32-bit, used to verify the TS port.
import sys
def murmur2(data: bytes, seed: int) -> int:
    m, r = 0x5bd1e995, 24
    length = len(data)
    h = (seed ^ length) & 0xFFFFFFFF
    i = 0
    while length >= 4:
        k = data[i] | data[i+1] << 8 | data[i+2] << 16 | data[i+3] << 24
        k = (k * m) & 0xFFFFFFFF; k ^= k >> r; k = (k * m) & 0xFFFFFFFF
        h = (h * m) & 0xFFFFFFFF; h ^= k
        i += 4; length -= 4
    if length == 3: h ^= data[i+2] << 16
    if length >= 2: h ^= data[i+1] << 8
    if length >= 1:
        h ^= data[i]; h = (h * m) & 0xFFFFFFFF
    h ^= h >> 13; h = (h * m) & 0xFFFFFFFF; h ^= h >> 15
    return h
for s in ["", "hello", "The quick brown fox"]:
    print(hex(murmur2(s.encode(), 1)))
