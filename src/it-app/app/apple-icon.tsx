import { ImageResponse } from 'next/og';

// Apple touch icon metadata
export const size = {
  width: 180,
  height: 180,
};
export const contentType = 'image/png';

// IT Support Center icon - Headset design (larger for Apple devices)
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 24,
          background: 'linear-gradient(135deg, #0078D4 0%, #005A9E 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '32px',
        }}
      >
        <svg
          width="120"
          height="120"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Headset band */}
          <path
            d="M4 12C4 7.58172 7.58172 4 12 4C16.4183 4 20 7.58172 20 12"
            stroke="white"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          {/* Left ear cup */}
          <rect
            x="2"
            y="11"
            width="4"
            height="7"
            rx="2"
            fill="white"
          />
          {/* Right ear cup */}
          <rect
            x="18"
            y="11"
            width="4"
            height="7"
            rx="2"
            fill="white"
          />
          {/* Microphone arm */}
          <path
            d="M6 18V20C6 20.5523 6.44772 21 7 21H10"
            stroke="white"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          {/* Microphone */}
          <circle
            cx="12"
            cy="21"
            r="2"
            fill="white"
          />
        </svg>
      </div>
    ),
    {
      ...size,
    }
  );
}
