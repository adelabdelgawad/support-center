"""
Encryption utilities for sensitive data storage.

Uses Fernet (symmetric encryption) with key derived from the application secret key.
"""
import base64
import hashlib
import logging
from cryptography.fernet import Fernet, InvalidToken
from core.config import settings

logger = logging.getLogger(__name__)


def _get_encryption_key() -> bytes:
    """
    Derive a Fernet-compatible encryption key from the application secret key.

    Uses PBKDF2 with SHA256 to derive a 32-byte key, then base64-encodes it
    for Fernet compatibility.

    Returns:
        Base64-encoded 32-byte key suitable for Fernet
    """
    # Use a fixed salt (not ideal for password hashing, but acceptable for key derivation)
    # The security comes from the SECURITY_SECRET_KEY being kept secret
    salt = b"active_directory_encryption_salt_v1"

    # Derive 32 bytes using PBKDF2-HMAC-SHA256
    key_bytes = hashlib.pbkdf2_hmac(
        "sha256",
        settings.security.secret_key.encode("utf-8"),
        salt,
        iterations=100000,
        dklen=32
    )

    # Fernet requires base64-encoded key
    return base64.urlsafe_b64encode(key_bytes)


def encrypt_value(plaintext: str) -> str:
    """
    Encrypt a string value using Fernet symmetric encryption.

    Args:
        plaintext: The string to encrypt

    Returns:
        Base64-encoded encrypted string

    Raises:
        Exception: If encryption fails
    """
    try:
        key = _get_encryption_key()
        f = Fernet(key)
        encrypted_bytes = f.encrypt(plaintext.encode("utf-8"))
        return encrypted_bytes.decode("utf-8")
    except Exception as e:
        logger.error(f"Encryption failed: {e}")
        raise


def decrypt_value(ciphertext: str) -> str:
    """
    Decrypt a Fernet-encrypted string.

    Args:
        ciphertext: Base64-encoded encrypted string

    Returns:
        Decrypted plaintext string

    Raises:
        InvalidToken: If decryption fails (wrong key or corrupted data)
        Exception: For other decryption errors
    """
    try:
        key = _get_encryption_key()
        f = Fernet(key)
        decrypted_bytes = f.decrypt(ciphertext.encode("utf-8"))
        return decrypted_bytes.decode("utf-8")
    except InvalidToken:
        logger.error("Decryption failed: Invalid token (wrong key or corrupted data)")
        raise
    except Exception as e:
        logger.error(f"Decryption failed: {e}")
        raise
