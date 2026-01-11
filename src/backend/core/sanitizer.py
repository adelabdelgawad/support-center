"""
HTML Sanitization Module

Provides secure HTML sanitization for user-generated content, specifically chat messages,
to prevent XSS attacks while preserving basic text formatting.

Uses nh3 library (maintained by Cloudflare) for robust HTML sanitization.
"""

import nh3
from typing import Optional


# Maximum allowed message content length (100KB)
MAX_MESSAGE_LENGTH = 100_000

# Allowed HTML tags for basic text formatting
ALLOWED_TAGS = {
    "b",       # Bold
    "i",       # Italic
    "strong",  # Strong emphasis
    "em",      # Emphasis
    "u",       # Underline
    "s",       # Strikethrough
    "br",      # Line break
    "p",       # Paragraph
    "code",    # Inline code
    "pre",     # Preformatted text
}

# Allowed HTML attributes (empty for security - no attributes allowed)
ALLOWED_ATTRIBUTES = {}


def sanitize_html(content: str) -> str:
    """
    Sanitize HTML content to prevent XSS attacks.

    Allows only basic text formatting tags while stripping all potentially
    dangerous HTML elements, attributes, and JavaScript.

    Args:
        content: Raw HTML content to sanitize

    Returns:
        Sanitized HTML string with only allowed tags

    Example:
        >>> sanitize_html('<b>Hello</b><script>alert("XSS")</script>')
        '<b>Hello</b>'

        >>> sanitize_html('<p onclick="alert()">Click me</p>')
        '<p>Click me</p>'

        >>> sanitize_html('Plain text message')
        'Plain text message'
    """
    if not content:
        return ""

    # Use nh3 to clean HTML with our allowed tags
    sanitized = nh3.clean(
        content,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        link_rel=None,  # No links allowed
        generic_attribute_prefixes=set(),  # No data-* or other prefixed attributes
        tag_attribute_values={},  # No specific attribute values
        set_tag_attribute_values={},  # No forced attribute values
        strip_comments=True,  # Remove HTML comments
    )

    return sanitized


def sanitize_message_content(content: Optional[str]) -> str:
    """
    Sanitize chat message content for safe storage and display.

    This is the primary function to use for all chat message content.
    Handles edge cases and enforces length limits.

    Args:
        content: Raw message content from user input (may be None)

    Returns:
        Sanitized message content ready for storage

    Raises:
        ValueError: If content exceeds maximum allowed length

    Example:
        >>> sanitize_message_content(None)
        ''

        >>> sanitize_message_content('')
        ''

        >>> sanitize_message_content('<b>Safe</b> message')
        '<b>Safe</b> message'

        >>> sanitize_message_content('<script>alert("XSS")</script>Hello')
        'Hello'
    """
    # Handle None and empty string
    if content is None or content == "":
        return ""

    # Strip leading/trailing whitespace
    content = content.strip()

    if not content:
        return ""

    # Check length before sanitization to prevent processing huge inputs
    if len(content) > MAX_MESSAGE_LENGTH:
        raise ValueError(
            f"Message content exceeds maximum length of {MAX_MESSAGE_LENGTH} characters"
        )

    # Sanitize the HTML content
    sanitized = sanitize_html(content)

    # Strip whitespace again after sanitization (tag removal might leave extra spaces)
    sanitized = sanitized.strip()

    return sanitized


def is_content_safe(content: str) -> bool:
    """
    Check if content is safe (i.e., sanitization doesn't change it).

    Useful for detecting if user input contains potentially malicious HTML.

    Args:
        content: Content to check

    Returns:
        True if content is already safe, False if sanitization would modify it

    Example:
        >>> is_content_safe('<b>Bold text</b>')
        True

        >>> is_content_safe('<script>alert("XSS")</script>')
        False

        >>> is_content_safe('<b onclick="alert()">Click</b>')
        False
    """
    if not content:
        return True

    sanitized = sanitize_message_content(content)
    return content.strip() == sanitized


def get_plain_text(content: str) -> str:
    """
    Extract plain text from HTML content by removing all tags.

    Useful for notifications, search indexing, or previews.

    Args:
        content: HTML content

    Returns:
        Plain text without any HTML tags

    Example:
        >>> get_plain_text('<b>Bold</b> and <i>italic</i> text')
        'Bold and italic text'

        >>> get_plain_text('<p>Paragraph 1</p><p>Paragraph 2</p>')
        'Paragraph 1Paragraph 2'
    """
    if not content:
        return ""

    # First sanitize to ensure safety
    sanitized = sanitize_html(content)

    # Then strip all remaining tags
    plain_text = nh3.clean(
        sanitized,
        tags=set(),  # No tags allowed
        attributes={},
        strip_comments=True,
    )

    return plain_text.strip()
