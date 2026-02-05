import React from 'react';

const Navbar: React.FC = () => {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-6 max-w-7xl mx-auto w-full">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-blue-600/20">
          P
        </div>
        <span className="text-slate-900 font-bold text-xl tracking-tight">Punë.</span>
      </div>

      <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
        <a href="#" className="hover:text-blue-600 transition-colors">Punësim</a>
        <a href="#" className="hover:text-blue-600 transition-colors">Kompani</a>
        <a href="#" className="hover:text-blue-600 transition-colors">Rreth Nesh</a>
      </div>

      <div className="flex items-center gap-4">
        <button className="text-slate-600 hover:text-slate-900 text-sm font-medium transition-colors">
          Hyni
        </button>
        <button className="bg-slate-900 text-white px-5 py-2 rounded-full text-sm font-medium hover:bg-slate-800 transition-all shadow-lg hover:shadow-xl">
          Regjistrohu
        </button>
      </div>
    </nav>
  );
};

export default Navbar;