import { prisma } from "../database/prisma";
import { ParsedZealyUrl, ProjectWithStats } from "../types";
import { parseZealyUrl } from "../utils/zealy-url";
import { createLogger } from "../utils/logger";

const logger = createLogger("project-service");

export interface CreateProjectInput {
  url: string;
  scanIntervalMinutes?: number;
  notifyOnInitialScan?: boolean;
}

export interface ProjectService {
  create(input: CreateProjectInput): Promise<ProjectWithStats>;
  findAll(): Promise<ProjectWithStats[]>;
  findById(id: string): Promise<ProjectWithStats | null>;
  findBySlug(slug: string): Promise<ProjectWithStats | null>;
  update(id: string, data: Partial<CreateProjectInput>): Promise<ProjectWithStats>;
  toggleActive(id: string, isActive: boolean): Promise<ProjectWithStats>;
  delete(id: string): Promise<void>;
  updateLastChecked(id: string): Promise<void>;
}

async function enrichWithStats(project: {
  id: string;
  url: string;
  projectSlug: string;
  projectName: string;
  isActive: boolean;
  scanIntervalMinutes: number;
  notifyOnInitialScan: boolean;
  lastCheckedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): Promise<ProjectWithStats> {
  const [questCount, lastScan] = await Promise.all([
    prisma.quest.count({ where: { projectId: project.id } }),
    prisma.scan.findFirst({
      where: { projectId: project.id },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true },
    }),
  ]);

  return {
    ...project,
    questCount,
    lastScanAt: lastScan?.startedAt ?? null,
  };
}

export const projectService: ProjectService = {
  async create(input: CreateProjectInput) {
    const parsed = parseZealyUrl(input.url);
    if (!parsed) {
      throw new Error("Invalid Zealy URL format");
    }

    const existing = await prisma.project.findUnique({
      where: { projectSlug: parsed.projectSlug },
    });

    if (existing) {
      throw new Error(`Project ${parsed.projectName} already exists`);
    }

    const project = await prisma.project.create({
      data: {
        url: parsed.url,
        projectSlug: parsed.projectSlug,
        projectName: parsed.projectName,
        scanIntervalMinutes: input.scanIntervalMinutes ?? 5,
        notifyOnInitialScan: input.notifyOnInitialScan ?? false,
      },
    });

    logger.info({ projectId: project.id, projectSlug: project.projectSlug }, "Project created");
    return enrichWithStats(project);
  },

  async findAll() {
    const projects = await prisma.project.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
    });

    return Promise.all(projects.map((p) => enrichWithStats(p)));
  },

  async findById(id: string) {
    const project = await prisma.project.findUnique({ where: { id } });
    return project ? enrichWithStats(project) : null;
  },

  async findBySlug(slug: string) {
    const project = await prisma.project.findUnique({ where: { projectSlug: slug } });
    return project ? enrichWithStats(project) : null;
  },

  async update(id: string, data: Partial<CreateProjectInput>) {
    let updateData: Record<string, unknown> = { ...data };

    if (data.url) {
      const parsed = parseZealyUrl(data.url);
      if (!parsed) {
        throw new Error("Invalid Zealy URL format");
      }
      updateData = {
        ...updateData,
        url: parsed.url,
        projectSlug: parsed.projectSlug,
        projectName: parsed.projectName,
      };
    }

    const project = await prisma.project.update({
      where: { id },
      data: updateData,
    });

    logger.info({ projectId: id }, "Project updated");
    return enrichWithStats(project);
  },

  async toggleActive(id: string, isActive: boolean) {
    const project = await prisma.project.update({
      where: { id },
      data: { isActive },
    });

    logger.info({ projectId: id, isActive }, "Project active status toggled");
    return enrichWithStats(project);
  },

  async delete(id: string) {
    await prisma.project.delete({ where: { id } });
    logger.info({ projectId: id }, "Project deleted");
  },

  async updateLastChecked(id: string) {
    await prisma.project.update({
      where: { id },
      data: { lastCheckedAt: new Date() },
    });
  },
};

export function validateAndParseUrl(url: string): ParsedZealyUrl {
  const parsed = parseZealyUrl(url);
  if (!parsed) {
    throw new Error("Invalid Zealy URL. Expected format: https://zealy.io/cw/{project-slug}/questboard/");
  }
  return parsed;
}