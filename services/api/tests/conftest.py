"""Test environment.

`jwt_secret` has no default by design, so tests must supply one, exactly as deployment does.
"""

import os

os.environ.setdefault("AGRI_JWT_SECRET", "test-secret-not-used-outside-tests")
