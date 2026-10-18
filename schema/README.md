# Schema

Run the files in order (001 to 016) in the Supabase SQL Editor.
They can be re-run safely.

Run a new migration before deploying the code that needs it, and run it on the end-to-end
project as well as the real one.

016 is the one to be careful about: the dashboard selects `documents.error`, so deploying
the code before applying it leaves the document list empty rather than degrading quietly.
