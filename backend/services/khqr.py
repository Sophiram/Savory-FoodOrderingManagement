import hashlib
from typing import Optional, Tuple
import httpx
from config import get_settings

settings = get_settings()


def tlv(tag: str, value: str) -> str:
    """Format Tag-Length-Value according to EMVCo / NBC KHQR spec."""
    return f"{tag}{len(value):02d}{value}"


def crc16_ccitt(data: str) -> str:
    """Calculate CRC-16/CCITT (polynomial 0x1021, init 0xFFFF)."""
    crc = 0xFFFF
    for ch in data:
        crc ^= ord(ch) << 8
        for _ in range(8):
            if crc & 0x8000:
                crc = ((crc << 1) ^ 0x1021) & 0xFFFF
            else:
                crc = (crc << 1) & 0xFFFF
    return f"{crc:04X}"


def build_khqr_string(
    amount: float,
    order_reference: str,
    account: Optional[str] = None,
    merchant_name: Optional[str] = None,
    merchant_city: Optional[str] = None,
    store_label: Optional[str] = None,
    terminal_label: str = "POS001",
    currency: str = "USD",
    usd_to_khr_rate: int = 4100
) -> str:
    """
    Generate an EMVCo compliant NBC KHQR dynamic QR string.
    Works directly with all Cambodian banking apps (Bakong, ABA, Wing, ACLEDA, etc.).
    """
    acc = (account or settings.khqr_account).strip()
    m_name = (merchant_name or settings.khqr_merchant_name).strip().upper()[:25]
    m_city = (merchant_city or "Phnom Penh")[:15]
    store = (store_label or settings.bakong_store_label)[:25]
    bill_no = order_reference[:25]

    is_khr = currency.upper() == "KHR"
    currency_code = "116" if is_khr else "840"
    amount_str = str(int(round(amount * usd_to_khr_rate))) if is_khr else f"{amount:.2f}"

    import time
    now_ms = int(time.time() * 1000)
    exp_ms = now_ms + (30 * 60 * 1000)  # 30 min expiration

    # Tag 29: Merchant Account Information - Individual (Bakong Account ID)
    # Sub-tag 00: Bakong Account ID directly (e.g. sorn_sophiram@bkrt)
    tag29 = tlv("29", tlv("00", acc))

    # Tag 62: Additional Data Field Template
    # Sub-tag 01: Bill Number
    # Sub-tag 03: Store Label
    # Sub-tag 07: Terminal Label
    tag62 = tlv(
        "62",
        tlv("01", bill_no) + tlv("03", store) + tlv("07", terminal_label[:25])
    )

    # Tag 99: Dynamic QR Timestamps
    # Sub-tag 00: Creation timestamp (13 digits)
    # Sub-tag 01: Expiration timestamp (13 digits)
    tag99 = tlv("99", tlv("00", str(now_ms)) + tlv("01", str(exp_ms)))

    parts = [
        tlv("00", "01"),               # Payload format indicator
        tlv("01", "12"),               # Dynamic QR
        tag29,                         # Tag 29 Bakong account
        tlv("52", "5999"),             # MCC
        tlv("53", currency_code),       # Currency
        tlv("54", amount_str),         # Amount
        tlv("58", "KH"),               # Country code
        tlv("59", m_name),             # Merchant Name
        tlv("60", m_city),             # Merchant City
        tag62,                         # Tag 62
        tag99,                         # Tag 99 Dynamic timestamp
        "6304"                         # CRC Tag + Length
    ]

    payload_without_crc = "".join(parts)
    checksum = crc16_ccitt(payload_without_crc)
    return payload_without_crc + checksum


def compute_khqr_md5(qr_string: str) -> str:
    """Compute the 32-character hexadecimal MD5 hash of the KHQR string."""
    return hashlib.md5(qr_string.encode("utf-8")).hexdigest()


async def fetch_bakong_deeplink(
    qr_string: str,
    base_url: Optional[str] = None,
    token: Optional[str] = None
) -> Tuple[Optional[str], Optional[str]]:
    """
    Call Bakong Open API to get a mobile banking app short link and transaction hash.
    Returns (short_link, md5_hash).
    """
    b_url = base_url or settings.khqr_base_url
    tok = token or settings.khqr_token

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            headers = {"Authorization": f"Bearer {tok}"} if tok else {}
            res = await client.post(
                f"{b_url}/v1/generate_deeplink_by_qr",
                headers=headers,
                json={
                    "qr": qr_string,
                    "sourceInfo": {
                        "appName": settings.bakong_store_label or "Savory",
                        "appIconUrl": "https://savory.app/logo.png",
                        "appDeepLinkCallback": "savory://payment-callback"
                    }
                }
            )
            if res.status_code == 200:
                data = res.json()
                if data.get("responseCode") == 0:
                    resp_data = data.get("data") or {}
                    short_link = resp_data.get("shortLink")
                    md5_val = resp_data.get("md5") or resp_data.get("hash")
                    return short_link, md5_val
    except Exception as e:
        print(f"[Bakong Deeplink Error] {e}")

    return None, None


async def check_bakong_payment_status(
    md5_hash: str,
    base_url: Optional[str] = None,
    token: Optional[str] = None
) -> bool:
    """
    Query Bakong API check_transaction_by_md5 to verify if the payment was completed.
    """
    b_url = base_url or settings.khqr_base_url
    tok = token or settings.khqr_token

    if not tok or not md5_hash:
        return False

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.post(
                f"{b_url}/v1/check_transaction_by_md5",
                headers={"Authorization": f"Bearer {tok}"},
                json={"md5": md5_hash}
            )
            if res.status_code == 200:
                data = res.json()
                if data.get("responseCode") == 0 and data.get("data") is not None:
                    return True
    except Exception as e:
        print(f"[Bakong Payment Check Error] {e}")

    return False
