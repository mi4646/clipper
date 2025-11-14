/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
      "./index.html",
      "./src/**/*.{js,jsx,ts,tsx}", // 确保包含 tsx 文件
    ],
    theme: {
      extend: {
        colors: {
          primary: '#1a1a1a',
          secondary: '#f8f5f2', // 这个名字必须和 CSS 类名中的一致
          accent: '#6b7280',
        },
        fontFamily: {
          sans: ['Inter', 'system-ui', 'sans-serif'],
        },
      },
    },
    plugins: [],
  }