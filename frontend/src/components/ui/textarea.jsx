import * as React from "react"
import { cn } from "@/lib/utils"

const Textarea = React.forwardRef(({ className, style, dir, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      dir={dir}
      // ✅ plaintext can flip RTL based on first strong char; isolate keeps direction stable
      style={{
        direction: dir || "ltr",
        unicodeBidi: "isolate",
        textAlign: "left",
        ...style,
      }}
      className={cn(
        "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background " +
          "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
          "focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }