import { ImageResponse } from 'next/og'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: 'linear-gradient(135deg, #00ff88 0%, #00d4ff 50%, #8b5cf6 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 18,
        }}
      >
        <div
          style={{
            width: 15,
            height: 15,
            borderRadius: '50%',
            border: '2px solid rgba(10,10,26,0.8)',
            borderTopColor: 'transparent',
            transform: 'rotate(-35deg)',
          }}
        />
      </div>
    ),
    { width: 32, height: 32 },
  )
}
