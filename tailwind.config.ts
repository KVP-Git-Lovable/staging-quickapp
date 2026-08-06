import type { Config } from "tailwindcss";

export default {
	darkMode: ["class"],
	content: [
		"./pages/**/*.{ts,tsx}",
		"./components/**/*.{ts,tsx}",
		"./app/**/*.{ts,tsx}",
		"./src/**/*.{ts,tsx}",
	],
	prefix: "",
	theme: {
		container: {
			center: true,
			padding: '2rem',
			screens: {
				'2xl': '1400px'
			}
		},
		screens: {
			'xs': '475px',
			'sm': '640px',
			'md': '768px',
			'lg': '1024px',
			'xl': '1280px',
			'2xl': '1536px',
		},
		extend: {
			fontFamily: {
				sans: ['Manrope', 'Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'Noto Sans', 'sans-serif'],
				heading: ['Sora', 'Manrope', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
			},
			colors: {
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))',
					light: 'hsl(var(--primary-light))',
					dark: 'hsl(var(--primary-dark))'
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))',
					gold: 'hsl(var(--accent-gold))',
					'gold-foreground': 'hsl(var(--accent-gold-foreground))',
					bronze: 'hsl(var(--accent-bronze))',
					'bronze-foreground': 'hsl(var(--accent-bronze-foreground))'
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))'
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))'
				},
				success: {
					DEFAULT: 'hsl(var(--success))',
					foreground: 'hsl(var(--success-foreground))'
				},
				warning: {
					DEFAULT: 'hsl(var(--warning))',
					foreground: 'hsl(var(--warning-foreground))'
				},
				sidebar: {
					DEFAULT: 'hsl(var(--sidebar-background))',
					foreground: 'hsl(var(--sidebar-foreground))',
					primary: 'hsl(var(--sidebar-primary))',
					'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
					accent: 'hsl(var(--sidebar-accent))',
					'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
					border: 'hsl(var(--sidebar-border))',
					ring: 'hsl(var(--sidebar-ring))'
				},
				'beat-assigned': 'hsl(var(--beat-assigned))',
				'beat-served': 'hsl(var(--beat-served))',
				'beat-stale': 'hsl(var(--beat-stale))',
				'beat-uncovered': 'hsl(var(--beat-uncovered))',
				'beat-shared': 'hsl(var(--beat-shared))',
				'beat-missed': 'hsl(var(--beat-missed))',
				'beat-partial': 'hsl(var(--beat-partial))'
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)'
			},
			backgroundImage: {
				'gradient-primary': 'var(--gradient-primary)',
				'gradient-subtle': 'var(--gradient-subtle)',
				'gradient-hero': 'var(--gradient-hero)'
			},
			boxShadow: {
				'card': 'var(--shadow-card)',
				'button': 'var(--shadow-button)',
				'hero': 'var(--shadow-hero)'
			},
			keyframes: {
				'accordion-down': {
					from: {
						height: '0'
					},
					to: {
						height: 'var(--radix-accordion-content-height)'
					}
				},
				'accordion-up': {
					from: {
						height: 'var(--radix-accordion-content-height)'
					},
					to: {
						height: '0'
					}
				},
				'party-shake': {
					'0%, 100%': { transform: 'translate(-50%, -50%) rotate(-8deg)' },
					'50%': { transform: 'translate(-50%, -55%) rotate(8deg)' }
				},
				'confetti-1': { '0%': { transform: 'translate(0,0) scale(1)', opacity: '1' }, '100%': { transform: 'translate(-30px,-40px) scale(0.3)', opacity: '0' } },
				'confetti-2': { '0%': { transform: 'translate(0,0) scale(1)', opacity: '1' }, '100%': { transform: 'translate(-45px,30px) scale(0.3)', opacity: '0' } },
				'confetti-3': { '0%': { transform: 'translate(0,0) scale(1)', opacity: '1' }, '100%': { transform: 'translate(35px,-35px) scale(0.3)', opacity: '0' } },
				'confetti-4': { '0%': { transform: 'translate(0,0) scale(1)', opacity: '1' }, '100%': { transform: 'translate(40px,25px) scale(0.3)', opacity: '0' } },
				'confetti-5': { '0%': { transform: 'translate(0,0) scale(1)', opacity: '1' }, '100%': { transform: 'translate(-25px,40px) scale(0.3)', opacity: '0' } },
				'confetti-6': { '0%': { transform: 'translate(0,0) scale(1)', opacity: '1' }, '100%': { transform: 'translate(30px,35px) scale(0.3)', opacity: '0' } },
				'confetti-fall': {
					'0%': { transform: 'translateY(-10vh) rotate(0deg)', opacity: '0' },
					'8%': { opacity: '1' },
					'100%': { transform: 'translateY(112vh) rotate(720deg)', opacity: '0' }
				},
				'emoji-rise': {
					'0%': { transform: 'translateY(0) scale(.7)', opacity: '0' },
					'15%': { opacity: '1' },
					'100%': { transform: 'translateY(-72vh) scale(1.15)', opacity: '0' }
				},
				'trophy-float': {
					'0%, 100%': { transform: 'translateY(0)' },
					'50%': { transform: 'translateY(-8px)' }
				},
				'trophy-pop': {
					'0%': { transform: 'scale(.4) rotate(-12deg)', opacity: '0' },
					'60%': { transform: 'scale(1.12) rotate(4deg)', opacity: '1' },
					'100%': { transform: 'scale(1) rotate(0deg)', opacity: '1' }
				},
				'ray-spin': {
					'0%': { transform: 'rotate(0deg)' },
					'100%': { transform: 'rotate(360deg)' }
				},
				'glow-pulse': {
					'0%, 100%': { opacity: '.75', transform: 'scale(1)' },
					'50%': { opacity: '1', transform: 'scale(1.06)' }
				},
				'sparkle-twinkle': {
					'0%, 100%': { opacity: '0', transform: 'scale(.5) rotate(0deg)' },
					'50%': { opacity: '1', transform: 'scale(1.15) rotate(25deg)' }
				},
				'confetti-drift': {
					'0%': { opacity: '0', transform: 'translateY(-6px) rotate(0deg)' },
					'20%': { opacity: '1' },
					'100%': { opacity: '0', transform: 'translateY(26px) rotate(220deg)' }
				},
				'ring-pulse': {
					'0%, 100%': { opacity: '.55', transform: 'translateX(-50%) scale(.94)' },
					'50%': { opacity: '1', transform: 'translateX(-50%) scale(1.04)' }
				},
				'fade-in': {
					'0%': { opacity: '0' },
					'100%': { opacity: '1' }
				},
				'scale-in': {
					'0%': { transform: 'scale(.94)', opacity: '0' },
					'100%': { transform: 'scale(1)', opacity: '1' }
				}
			},
			animation: {
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out',
				'party-shake': 'party-shake 1.6s ease-in-out infinite',
				'confetti-1': 'confetti-1 2s ease-out infinite',
				'confetti-2': 'confetti-2 2.3s ease-out infinite 0.2s',
				'confetti-3': 'confetti-3 2.1s ease-out infinite 0.4s',
				'confetti-4': 'confetti-4 2.4s ease-out infinite 0.6s',
				'confetti-5': 'confetti-5 2.2s ease-out infinite 0.3s',
				'confetti-6': 'confetti-6 2.5s ease-out infinite 0.5s',
				'confetti-fall': 'confetti-fall 3s linear forwards',
				'emoji-rise': 'emoji-rise 3.4s ease-out forwards',
				'trophy-float': 'trophy-float 3.2s ease-in-out infinite',
				'trophy-pop': 'trophy-pop .7s cubic-bezier(.34,1.56,.64,1) both',
				'fade-in': 'fade-in .3s ease-out',
				'scale-in': 'scale-in .35s ease-out both'
			}

		}
	},
	plugins: [require("tailwindcss-animate")],
} satisfies Config;
