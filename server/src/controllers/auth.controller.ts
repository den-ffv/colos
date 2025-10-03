import { prisma } from '@/utils/prisma';

type RegisterProps = {
  login: string;
  email: string;
  password: string;
  name?: string;
};
export const register = async (data: RegisterProps) => {
  const { login, email, password, name } = data;

  const user = await prisma.user.findFirst({
    where: { OR: [{ login }, { email }] },
  });

  if (user) {
    throw new Error('User with this login or email already exists');
  }

  const newUser = await prisma.user.create({
    data: {
      login,
      email,
      password, // In a real application, make sure to hash the password before storing it
      name,
    },
  });

  return {
    id: newUser.id,
    login: newUser.login,
    email: newUser.email,
    name: newUser.name,
  };
};

type LoginProps = {
  login: string;
  password: string;
}

export const login = async (data: LoginProps) => {
  const { login, password } = data;

  const user = await prisma.user.findFirst({
    where: { login, password }, // In a real application, compare hashed passwords
  });
  
  if (!user) {
    throw new Error('Invalid login or password');
  }

  return {
    id: user.id,
    login: user.login,
    email: user.email,
    name: user.name,
  };
};
