import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

const COMPANY_ID = '92ea6410-a396-44c6-bd2f-68dd7b062ffb';
const SALT_ROUNDS = 10;
const NOW = new Date();

const logists = [
  { firstNameUa: 'Наталія', lastNameUa: 'Гончаренко', firstName: 'Nataliia', lastName: 'Honcharenko', login: 'nhoncharenko' },
  { firstNameUa: 'Олена',   lastNameUa: 'Мартиненко',  firstName: 'Olena',    lastName: 'Martynenko',  login: 'omartynenko'  },
  { firstNameUa: 'Богдан',  lastNameUa: 'Савченко',    firstName: 'Bohdan',   lastName: 'Savchenko',   login: 'bsavchenko'   },
];

async function main() {
  console.log('Seeding logists...');

  for (const l of logists) {
    const password = await bcrypt.hash(l.login, SALT_ROUNDS);
    const userId = randomUUID();
    const roleId = randomUUID();

    await prisma.users.create({
      data: {
        id: userId,
        email: `${l.login}@colos.ua`,
        password,
        company_id: COMPANY_ID,
        first_name: l.firstNameUa,
        last_name: l.lastNameUa,
        is_active: true,
        ui_language: 'UA',
        created_at: NOW,
        updated_at: NOW,
      },
    });

    await prisma.user_roles.create({
      data: {
        id: roleId,
        user_id: userId,
        role: 'LOGIST',
        created_at: NOW,
        updated_at: NOW,
      },
    });

    console.log(`  ✓ ${l.firstNameUa} ${l.lastNameUa} | login: ${l.login}@colos.ua | password: ${l.login}`);
  }

  console.log('\nDone!');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
