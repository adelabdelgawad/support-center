// ============================================================================
// PHASE 2 OPTIMIZATIONS: PostCSS with cssnano for production
// ============================================================================

export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},

    // Add cssnano for CSS minification in production
    // This provides additional compression beyond Tailwind's purging
    ...(process.env.NODE_ENV === 'production'
      ? {
          cssnano: {
            preset: [
              'default',
              {
                // Minification options
                discardComments: {
                  removeAll: true, // Remove all comments
                },
                normalizeWhitespace: true,
                colormin: true,
                minifyFontValues: true,
                minifySelectors: true,
              },
            ],
          },
        }
      : {}),
  },
};
