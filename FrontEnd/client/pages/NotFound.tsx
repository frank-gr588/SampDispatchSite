import { useLocation } from "react-router-dom";

const NotFound = () => {
  const location = useLocation();

  return (
    <div className="h-screen flex items-center justify-center bg-[#020304]">
      <div className="border border-[#003d10] bg-[#060a0e] p-8 text-center">
        <div className="text-[#33ff66] text-[48px] tracking-[8px] mb-4">404</div>
        <div className="text-[#ff2020] text-[10px] uppercase tracking-[3px] mb-2">ROUTE NOT FOUND</div>
        <div className="text-[#5a9a5a] text-[10px] mb-4 font-mono">{location.pathname}</div>
        <a href="/" className="text-[#007a1f] text-[10px] uppercase tracking-[2px] hover:text-[#33ff66] border border-[#003d10] px-4 py-2 inline-block hover:border-[#33ff66]">
          RETURN TO TERMINAL
        </a>
      </div>
    </div>
  );
};

export default NotFound;
