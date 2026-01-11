/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    // Explicitly include all possible template paths for better tree-shaking
    "./public/**/*.html",
  ],

  // ============================================================================
  // PHASE 2 OPTIMIZATIONS: Enhanced CSS Purging
  // ============================================================================
  future: {
    // Enable future optimizations for smaller CSS
    hoverOnlyWhenSupported: true,
  },

  // Optimize for production
  ...(process.env.NODE_ENV === 'production' ? {
    // More aggressive purging in production
    safelist: [
      // Keep dynamic classes that might be generated programmatically
      'dark',
      // Use pattern object syntax for regex (Tailwind v3+ format)
      { pattern: /^bg-/ },
      { pattern: /^text-/ },
      { pattern: /^border-/ },
    ],
  } : {}),
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        // Core semantic colors (HSL-based for shadcn compatibility)
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",

        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          // Andalusia Health brand brown scale
          50: "#F9F6F0",   // Very light cream
          100: "#F0E8D8",  // Light cream
          200: "#E5D5BA",  // Soft beige
          300: "#D4B896",  // Medium beige
          400: "#B89566",  // Light brown
          500: "#8B6F47",  // Andalusia brand brown (main)
          600: "#75593A",  // Dark brown
          700: "#5F472F",  // Darker brown
          800: "#4A3724",  // Very dark brown
          900: "#33261A",  // Darkest brown
        },

        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },

        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },

        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },

        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
          // Andalusia Health gold scale
          400: "#DAB066",  // Light gold
          500: "#C9A055",  // Andalusia brand gold (main)
          600: "#B08943",  // Medium gold
          700: "#8F6E35",  // Dark gold
          800: "#6E5428",  // Darkest gold
        },

        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },

        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },

        // WhatsApp-inspired semantic colors
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },

        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },

        // Andalusia Health chat colors (warm, minimal white)
        chat: {
          background: "#F5F0E8", // Soft cream background
          header: "#8B6F47",     // Andalusia brown header
          sidebar: "#FAF7F2",    // Light cream sidebar (not pure white)
          "own-message": "#F0E8D8", // Light gold/cream for user messages
          "other-message": "#FAF7F2", // Soft beige for support messages
          "own-message-hover": "#E5D5BA", // Hover state for own messages
          "other-message-hover": "#EBE3D6", // Hover state for other messages
        },

        // Warm neutral scale (brown-tinted, no cool grays)
        neutral: {
          100: "#F5F0E8", // Cream background (replaces white)
          200: "#EBE3D6", // Light beige
          300: "#D9CFC0", // Medium beige (borders/dividers)
          400: "#B5A68F", // Muted warm text
          500: "#8B7B63", // Secondary warm text
          600: "#6E5F4D", // Primary warm text
          700: "#574A3C", // Strong warm text
          800: "#3F352C", // Dark warm text
          850: "#2A2419", // Very dark warm surface
          900: "#1C1814", // Darkest warm background
        },
      },

      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },

      boxShadow: {
        // Custom shadows with warm brown tint (Andalusia Health)
        "warm-sm": "0 1px 2px rgba(139, 111, 71, 0.15)",
        "warm-md": "0 4px 6px rgba(139, 111, 71, 0.2)",
        "warm-lg": "0 10px 15px rgba(139, 111, 71, 0.25)",
        "warm-xl": "0 20px 25px rgba(139, 111, 71, 0.3)",
        // Gold glow for focus/highlight states
        "golden-sm": "0 0 10px rgba(201, 160, 85, 0.2)",
        "golden-md": "0 0 20px rgba(201, 160, 85, 0.3)",
        "golden-lg": "0 0 30px rgba(201, 160, 85, 0.4)",
      },

      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        // Pulse animation for notifications (Andalusia gold)
        "pulse-golden": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(201, 160, 85, 0.4)" },
          "50%": { boxShadow: "0 0 0 8px rgba(201, 160, 85, 0)" },
        },
        // Subtle fade in
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        // Slide up for modals/sheets
        "slide-up": {
          from: { transform: "translateY(10px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
      },

      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "pulse-golden": "pulse-golden 2s ease-in-out infinite",
        "fade-in": "fade-in 0.2s ease-out",
        "slide-up": "slide-up 0.3s ease-out",
      },

      // Typography scale refinements
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "1rem" }],
      },

      // Transition durations
      transitionDuration: {
        "fast": "100ms",
        "normal": "200ms",
        "slow": "300ms",
      },
    },
  },
  plugins: [],
};
