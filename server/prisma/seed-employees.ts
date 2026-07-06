import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

const COMPANY_ID = '92ea6410-a396-44c6-bd2f-68dd7b062ffb';
const SALT_ROUNDS = 10;
const NOW = new Date();

const drivers = [
  { firstName: 'Oleksii',  lastName: 'Kovalenko',  login: 'okovalenko',  license: 'АА123456', payRate: 8.5,  payType: 'PER_KM'  },
  { firstName: 'Ivan',     lastName: 'Petrenko',   login: 'ipetrenko',   license: 'АВ234567', payRate: 9.0,  payType: 'PER_KM'  },
  { firstName: 'Vasyl',    lastName: 'Shevchenko', login: 'vshevchenko', license: 'АС345678', payRate: 7.5,  payType: 'PER_KM'  },
  { firstName: 'Mykola',   lastName: 'Bondarenko', login: 'mbondarenko', license: 'АЕ456789', payRate: 850,  payType: 'PER_DAY' },
  { firstName: 'Andrii',   lastName: 'Tymchenko',  login: 'atymchenko',  license: 'АН567890', payRate: 8.0,  payType: 'PER_KM'  },
  { firstName: 'Serhii',   lastName: 'Moroz',      login: 'smoroz',      license: 'АІ678901', payRate: 120,  payType: 'PER_HOUR'},
  { firstName: 'Dmytro',   lastName: 'Lysenko',    login: 'dlysenko',    license: 'АК789012', payRate: 9.5,  payType: 'PER_KM'  },
  { firstName: 'Pavlo',    lastName: 'Hrytsenko',  login: 'phrytsenko',  license: 'АМ890123', payRate: 800,  payType: 'PER_DAY' },
  { firstName: 'Yurii',    lastName: 'Kravchenko', login: 'ykravchenko', license: 'АО901234', payRate: 10.0, payType: 'PER_KM'  },
  { firstName: 'Roman',    lastName: 'Sydorenko',  login: 'rsydorenko',  license: 'АП012345', payRate: 7.0,  payType: 'PER_KM'  },
];

const staff = [
  { firstName: 'Tetiana', lastName: 'Ivanchenko', login: 'tivanchenko', role: 'MANAGER'    },
  { firstName: 'Oksana',  lastName: 'Kovalchuk',  login: 'okovalchuk',  role: 'DISPATCHER' },
];

async function main() {
  console.log('Seeding employees...');

  for (const d of drivers) {
    const password = await bcrypt.hash(d.login, SALT_ROUNDS);
    const userId = randomUUID();
    const driverId = randomUUID();
    const roleId = randomUUID();

    await prisma.users.create({
      data: {
        id: userId,
        email: `${d.login}@colos.ua`,
        password,
        company_id: COMPANY_ID,
        first_name: d.firstName,
        last_name: d.lastName,
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
        role: 'DRIVER',
        created_at: NOW,
        updated_at: NOW,
      },
    });

    await prisma.drivers.create({
      data: {
        id: driverId,
        first_name: d.firstName,
        last_name: d.lastName,
        phone: `+380501${Math.floor(100000 + Math.random() * 900000)}`,
        company_id: COMPANY_ID,
        license_number: d.license,
        is_available: true,
        pay_rate: d.payRate,
        pay_type: d.payType as any,
        user_id: userId,
        created_at: NOW,
        updated_at: NOW,
      },
    });

    console.log(`  ✓ Driver: ${d.firstName} ${d.lastName} | login: ${d.login}@colos.ua | password: ${d.login}`);
  }

  for (const s of staff) {
    const password = await bcrypt.hash(s.login, SALT_ROUNDS);
    const userId = randomUUID();
    const roleId = randomUUID();

    await prisma.users.create({
      data: {
        id: userId,
        email: `${s.login}@colos.ua`,
        password,
        company_id: COMPANY_ID,
        first_name: s.firstName,
        last_name: s.lastName,
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
        role: s.role as any,
        created_at: NOW,
        updated_at: NOW,
      },
    });

    console.log(`  ✓ Staff:  ${s.firstName} ${s.lastName} | login: ${s.login}@colos.ua | password: ${s.login} | role: ${s.role}`);
  }

  console.log('\nDone!');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
