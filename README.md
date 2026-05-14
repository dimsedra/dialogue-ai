# Dialogue: Agent-Native Productivity Workspace

Dialogue is a high-performance, minimal productivity ecosystem engineered for agentic AI collaboration. It provides a project-aware command center that integrates conversational intelligence with structured task and event management.

## Core Features

### Agent-Native Architecture
*   **Semantic Memory System**: Dialogue incorporates a background reflection engine that analyzes user interactions every 20 messages to synthesize persistent behavioral models and preferences.
*   **Intelligence Agnosticism**: Built with a "Bring Your Own Key" (BYOK) philosophy, supporting Google Gemini Pro for production and LM Studio for local, private inference.
*   **Contextual Awareness**: The internal agent maintains real-time awareness of active workspace data, including tasks, project history, and scheduled milestones.

### Hierarchical Workspace Management
*   **Project Silos**: Dedicated workspaces allow for total context isolation between different ventures, each with independent history, tasks, and visual identifiers.
*   **Navigation Stability**: Optimized for professional workflows with persistent layout states and synchronized sidebar configurations across sessions.

### Integrated Productivity Suite
*   **Structured Task Management**: Workspace-aware task panel featuring priority-based sorting, AI-driven categorization, and real-time status synchronization.
*   **Timeline and Scheduling**: Integrated event tracking and calendar views optimized for project-specific milestone management.
*   **Unified History**: Global archive of all conversational data, indexed by workspace and searchable across the entire ecosystem.

### Ergonomics and Performance
*   **Mobile-First Engineering**: Fluid, width-based transitions eliminate layout shifts and provide native-quality responsiveness on smaller viewports.
*   **Persistence Layer**: Intelligent synchronization between local state and cloud functions ensures a seamless transition between devices and sessions.

## Technical Stack

*   **Framework**: Next.js 15 (App Router)
*   **Real-time Backend**: Convex
*   **Styling & Motion**: Tailwind CSS and Framer Motion
*   **AI Integration**: Google Gemini Pro API / LM Studio SDK
*   **Data Modeling**: TypeScript-first schema with validation

## Setup and Installation

1.  **Clone the Repository**
    ```bash
    git clone https://github.com/your-username/dialogue-ai.git
    cd dialogue-ai
    ```

2.  **Install Dependencies**
    ```bash
    npm install
    ```

3.  **Configure Environment Variables**
    Create a `.env.local` file with the following parameters:
    ```env
    # Convex Configuration
    CONVEX_DEPLOYMENT=your_deployment_name
    NEXT_PUBLIC_CONVEX_URL=your_convex_url

    # AI Provider Keys
    GEMINI_API_KEY=your_google_ai_key
    ```

4.  **Initialize Development Environment**
    Execute the following commands in parallel:
    ```bash
    # Frontend Development Server
    npm run dev

    # Backend Development Environment
    npx convex dev
    ```

## Deployment

Dialogue is optimized for deployment on the Vercel platform.

1.  Synchronize production backend functions: `npx convex deploy`
2.  Link the repository to a new Vercel project.
3.  Configure production environment variables (`CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CONVEX_URL`, `GEMINI_API_KEY`).

---

*Dialogue is engineered with a focus on intentionality, aesthetic minimalism, and high-performance AI integration.*
