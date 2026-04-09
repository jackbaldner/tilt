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
      {/* Horizontal strikethrough line */}
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
          x1="-4"
          y1="52"
          x2="104"
          y2="52"
          stroke="#2563EB"
          strokeWidth="7"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
