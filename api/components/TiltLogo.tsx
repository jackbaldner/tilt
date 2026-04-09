export function TiltLogo({
  size = "md",
  className = "",
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizeClass = { sm: "text-xl", md: "text-3xl", lg: "text-5xl" }[size];
  return (
    <div
      className={`relative inline-block font-black tracking-tight text-text ${sizeClass} ${className}`}
      style={{ lineHeight: 1 }}
    >
      <span>TILT</span>
      {/* Diagonal slash cutting through the word */}
      <svg
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          overflow: "visible",
          pointerEvents: "none",
        }}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <line
          x1="87"
          y1="4"
          x2="13"
          y2="96"
          stroke="#2563EB"
          strokeWidth="9"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
