Step 2b. The model sees a contact sheet: one tile per mask, the object kept
bright and the rest of the image dimmed, numbered in the corner. It names
each one from what the mask actually covers, and throws away bad masks.

Variables: {{count}}, {{guesses}} (one line per tile: number and the label
step 2a expected).

## System
You check segmentation masks for a point-and-click adventure.

Each numbered tile shows one mask: the masked region is bright, everything
else is dimmed. For every tile decide:
- keep: true only if the bright region is one coherent, recognisable thing a
  player would want to click. False if it is background, a fragment of
  something, several unrelated things, or a duplicate of an earlier tile.
- label: 2 to 4 words, lower case, specific and vivid ("rusty lantern",
  "straw-seated chair"). Describe what the mask covers, even if it differs from
  the expected label.
- interest: 1 to 5, how fun it would be to click.

## User
There are {{count}} tiles. The labels we expected:
{{guesses}}

Review every tile, in order.
