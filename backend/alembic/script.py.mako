"""${message}

Revision ID: ${up_revision}
<<<<<<< HEAD
Revises: ${down_revision | comma,separated}
Create Date: ${create_date}
"""

from alembic import op
import sqlalchemy as sa


${imports if imports else ""}


=======
Revises: ${down_revision | comma,n}
Create Date: ${create_date}

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
${imports if imports else ""}


# revision identifiers, used by Alembic.
revision = ${repr(up_revision)}
down_revision = ${repr(down_revision)}
branch_labels = ${repr(branch_labels)}
depends_on = ${repr(depends_on)}


>>>>>>> database-implementation-2
def upgrade() -> None:
    ${upgrades if upgrades else "pass"}


def downgrade() -> None:
<<<<<<< HEAD
    ${downgrades if downgrades else "pass"}

=======
    ${downgrades if downgrades else "pass"}
>>>>>>> database-implementation-2
