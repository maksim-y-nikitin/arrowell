FROM python:3.11-slim

# Install uv for fast, reproducible builds
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

WORKDIR /app

# Copy dependency specifications
COPY pyproject.toml uv.lock* ./

# Install dependencies into project environment
RUN uv sync --frozen --no-cache

# Copy backend source code
COPY src/ ./src/

# Expose FastAPI port
EXPOSE 8000

# Run uvicorn with src as application directory
CMD ["uv", "run", "uvicorn", "main:app", "--app-dir", "src", "--host", "0.0.0.0", "--port", "8000"]