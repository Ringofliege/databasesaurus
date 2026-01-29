// Prisma v7 Configuration (for future migration)
// Currently the meta-DB uses traditional datasource format in schema.prisma
// 
// Each cloned project can have its own Prisma version and configuration
// The runPrismaCommand() function in src/lib/runner.ts:
// - Changes to the project's workspace directory (cwd)
// - Passes DATABASE_URL as environment variable
// - Runs Prisma commands against the project's own schema.prisma
//
// This enables multi-version Prisma support across different projects
// without interfering with the meta-DB configuration.
