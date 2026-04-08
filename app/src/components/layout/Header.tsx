/**
 * Placeholder header matching HOT Tech Suite style.
 * Will be replaced with @hotosm/ui shared header component when available.
 */
export default function Header() {
  return (
    <header className="fixed top-0 left-0 right-0 z-30 bg-white border-b border-gray-200 h-14 flex items-center px-4 shadow-sm">
      {/* Logo + tool name */}
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 bg-[#d73f3f] rounded-full flex items-center justify-center">
          <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
          </svg>
        </div>
        <span className="text-[15px] font-semibold text-gray-900" style={{ fontFamily: 'Archivo, system-ui, sans-serif' }}>
          OpenAerialMap
        </span>
      </div>

      {/* Nav links */}
      <nav className="hidden md:flex items-center gap-6 ml-8">
        <a href="#" className="text-sm text-gray-600 hover:text-gray-900">Explore</a>
        <a href="#" className="text-sm text-gray-600 hover:text-gray-900">Learn</a>
        <a href="#" className="text-sm text-gray-600 hover:text-gray-900">About</a>
        <a href="https://docs.imagery.hotosm.org/" target="_blank" rel="noopener" className="text-sm text-gray-600 hover:text-gray-900">Docs</a>
      </nav>

      {/* Right side */}
      <div className="ml-auto flex items-center gap-3">
        <a
          href="https://upload.imagery.hotosm.org"
          target="_blank"
          rel="noopener"
          className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-[#d73f3f] border border-[#d73f3f] rounded-md hover:bg-red-50 transition-colors"
        >
          Share imagery
        </a>
        <button className="px-3 py-1.5 text-sm font-medium text-white bg-[#d73f3f] rounded-md hover:bg-[#c53030] transition-colors">
          Log in
        </button>
      </div>
    </header>
  );
}
