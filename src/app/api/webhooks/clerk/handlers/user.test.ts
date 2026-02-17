import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userCreate: vi.fn(),
  userUpdate: vi.fn(),
  profileCreate: vi.fn(),
  profileUpdate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
      create: mocks.userCreate,
      update: mocks.userUpdate,
    },
    profile: {
      create: mocks.profileCreate,
      update: mocks.profileUpdate,
    },
  },
}));

import { handleUserCreated, handleUserUpdated } from "./user";

describe("clerk webhook user handlers", () => {
  beforeEach(() => {
    mocks.userFindUnique.mockReset();
    mocks.userCreate.mockReset();
    mocks.userUpdate.mockReset();
    mocks.profileCreate.mockReset();
    mocks.profileUpdate.mockReset();
  });

  it("handleUserCreated creates user and profile when missing", async () => {
    mocks.userFindUnique.mockResolvedValue(null);
    mocks.userCreate.mockResolvedValue({ id: "user-1" });

    await handleUserCreated({
      id: "clerk-1",
      email_addresses: [{ email_address: "new@example.com" }],
      first_name: "Jane",
      last_name: "Doe",
    });

    expect(mocks.userCreate).toHaveBeenCalledWith({
      data: {
        clerkId: "clerk-1",
        email: "new@example.com",
      },
    });
    expect(mocks.profileCreate).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        name: "Jane Doe",
      },
    });
  });

  it("handleUserCreated updates email on existing user when changed", async () => {
    mocks.userFindUnique.mockResolvedValue({ id: "user-1", email: "old@example.com" });

    await handleUserCreated({
      id: "clerk-1",
      email_addresses: [{ email_address: "new@example.com" }],
    });

    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { email: "new@example.com" },
    });
    expect(mocks.userCreate).not.toHaveBeenCalled();
  });

  it("handleUserCreated does not create profile when no name is provided", async () => {
    mocks.userFindUnique.mockResolvedValue(null);
    mocks.userCreate.mockResolvedValue({ id: "user-1" });

    await handleUserCreated({
      id: "clerk-1",
      email_addresses: [{ email_address: "new@example.com" }],
    });

    expect(mocks.profileCreate).not.toHaveBeenCalled();
  });

  it("handleUserUpdated returns when user is missing", async () => {
    mocks.userFindUnique.mockResolvedValue(null);

    await handleUserUpdated({
      id: "clerk-404",
      email_addresses: [{ email_address: "missing@example.com" }],
      first_name: "Ghost",
    });

    expect(mocks.profileCreate).not.toHaveBeenCalled();
    expect(mocks.profileUpdate).not.toHaveBeenCalled();
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it("handleUserUpdated updates existing profile and email", async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: "user-1",
      email: "old@example.com",
      profile: { id: "profile-1" },
    });

    await handleUserUpdated({
      id: "clerk-1",
      email_addresses: [{ email_address: "new@example.com" }],
      first_name: "Updated",
      last_name: "Name",
    });

    expect(mocks.profileUpdate).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      data: { name: "Updated Name" },
    });
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { email: "new@example.com" },
    });
  });

  it("handleUserUpdated creates profile when missing", async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: "user-1",
      email: "same@example.com",
      profile: null,
    });

    await handleUserUpdated({
      id: "clerk-1",
      email_addresses: [{ email_address: "same@example.com" }],
      first_name: "Only",
      last_name: "Profile",
    });

    expect(mocks.profileCreate).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        name: "Only Profile",
      },
    });
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });
});
