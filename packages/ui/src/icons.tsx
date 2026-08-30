import type { SVGProps } from 'react'

/** original 24px line icons, 1.75 stroke, square caps - no third-party sets */
function Svg({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="square"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  )
}

export const IconToday = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M4 6h16M4 6v13h16V6M4 10h16M8 3v3M16 3v3M8 14h3v3H8z" />
  </Svg>
)

export const IconLearn = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M12 5c-2-1.6-5-1.6-8 0v14c3-1.6 6-1.6 8 0 2-1.6 5-1.6 8 0V5c-3-1.6-6-1.6-8 0zM12 5v14M18 10h4M20 8v4" />
  </Svg>
)

export const IconReview = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4" />
  </Svg>
)

export const IconMix = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M4 7h4l8 10h4M4 17h4M16 7h4M17 4l3 3-3 3M17 14l3 3-3 3" />
  </Svg>
)

export const IconLibrary = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M4 4h16v16H4zM4 9h16M4 14h16M9 4v16" />
  </Svg>
)

export const IconStats = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M4 20h16M7 20v-6M12 20V8M17 20v-9M4 4v16" />
  </Svg>
)

export const IconSettings = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M5 7h9M18 7h1M5 12h3M12 12h7M5 17h9M18 17h1M16 4.5v5M10 9.5v5M16 14.5v5" />
  </Svg>
)

export const IconSync = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M20 8a8 8 0 0 0-14-2M4 16a8 8 0 0 0 14 2M6 2v4h4M18 22v-4h-4" />
  </Svg>
)

export const IconSearch = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM16 16l5 5" />
  </Svg>
)

export const IconAudio = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M4 9h4l5-4v14l-5-4H4zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" />
  </Svg>
)

export const IconCheck = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M4 12.5 9.5 18 20 6.5" />
  </Svg>
)

export const IconClose = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M5 5l14 14M19 5 5 19" />
  </Svg>
)

export const IconChevron = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M9 5l7 7-7 7" />
  </Svg>
)

export const IconArrow = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M3 12h17M14 6l6 6-6 6" />
  </Svg>
)

export const IconPlus = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M12 4v16M4 12h16" />
  </Svg>
)

export const IconStar = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.8L12 16.8l-5.3 2.8 1.1-5.8L3.5 9.7l5.9-.8z" />
  </Svg>
)

export const IconFlag = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M6 21V4M6 4h11l-2.5 4L17 12H6" />
  </Svg>
)

export const IconClock = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5.5l3.5 2" />
  </Svg>
)

export const IconEye = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
  </Svg>
)

export const IconUpload = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />
  </Svg>
)

export const IconDownload = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M12 4v12M7 11l5 5 5-5M4 20h16" />
  </Svg>
)

export const IconUser = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M12 3a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zM4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
  </Svg>
)
