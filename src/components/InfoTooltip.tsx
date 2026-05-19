import { useState, type ReactNode } from 'react'

interface Props {
  content: ReactNode
  children?: ReactNode
}

export default function InfoTooltip({ content, children }: Props) {
  const [visible, setVisible] = useState(false)

  return (
    <span className="relative inline-flex items-center">
      <span
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        className="cursor-help inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold ml-1 shrink-0 select-none"
        style={{ background: '#e5e7eb', color: '#6b7280' }}
        aria-label="More information"
      >
        {children ?? '?'}
      </span>
      {visible && (
        <span
          className="absolute z-50 w-64 text-xs rounded-lg shadow-xl px-3 py-2.5 bottom-full left-1/2 -translate-x-1/2 mb-2 pointer-events-none leading-relaxed"
          style={{
            background: '#1e3a5f',
            color: '#f9fafb',
            border: '1px solid rgba(255,255,255,0.12)',
          }}
        >
          {content}
          <span
            className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0"
            style={{
              borderLeft: '5px solid transparent',
              borderRight: '5px solid transparent',
              borderTop: '5px solid #1e3a5f',
            }}
          />
        </span>
      )}
    </span>
  )
}
