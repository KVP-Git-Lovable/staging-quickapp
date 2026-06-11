## Root cause

`src/components/retailer/ApprovalChecklistDialog.tsx` references `React.ComponentType` (line 516) and `React.ReactNode` (line 522) but its import line only pulls named hooks:

```ts
import { useState, useEffect, useMemo } from "react";
```

There is no `import React from "react"`. In the production preview bundle this throws `ReferenceError: React is not defined`, which is exactly the error in the console logs and the screenshot ("The app encountered an error").

## Fix

Change the import in `src/components/retailer/ApprovalChecklistDialog.tsx` to also bring in the React namespace:

```ts
import React, { useState, useEffect, useMemo } from "react";
```

(Alternative: replace the two usages with `ComponentType` / `ReactNode` imported as named types. Either works — adding the default import is the smaller, safer edit.)

That's the only change needed. No other files reference `React.*` without importing it.
