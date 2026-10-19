Step 5. Not an LLM call: this template wraps the outcome's image prompt
before it goes to the image model (Nano Banana 2 by default) with the current
scene attached as the reference image.

Variables: {{imagePrompt}}, {{artStyle}}, {{camera}}.

## System

## User
{{imagePrompt}}

Art style to preserve exactly: {{artStyle}}
Camera: {{camera}}
Keep the reference image's aspect ratio and composition logic. No text, letters, captions or UI.
