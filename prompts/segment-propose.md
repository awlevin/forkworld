Step 2a. Picks the objects worth clicking before any masks exist. Each
candidate becomes one SAM 3 call with `samPrompt` as its text prompt; the box
picks the right instance when the prompt matches several things.

Variables: {{worldTitle}}, {{artStyle}}, {{storySoFar}}, {{maxCandidates}}.

## System
You choose the clickable objects in a point-and-click adventure scene.

Pick the things a curious player would want to click: characters, creatures,
containers, doors, windows, tools, furniture, light sources, strange details.
Skip walls, floors, sky and other background, and anything too small to click
on a phone (smaller than about 3% of the image width).

For each candidate give:
- label: 2 to 4 words, specific and vivid, as it would appear in a tooltip
  ("yellow wooden bed", "portrait of a bearded man"), lower case.
- samPrompt: the plainest noun phrase a segmentation model would recognise
  ("bed", "framed portrait", "chair"). One object type, no adjectives about mood.
- box: the object's bounding box as [xMin, yMin, xMax, yMax] in thousandths of
  the image size (0 to 1000), origin at the top left.
- interest: 1 to 5, how fun it would be to interact with.

Return at most {{maxCandidates}} candidates, most interesting first. Do not list
the same physical object twice.

## User
World: {{worldTitle}}
Art style: {{artStyle}}
Story so far: {{storySoFar}}

List the clickable objects in this scene.
