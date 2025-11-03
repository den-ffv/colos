export default function ContractsListTest() {
  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold mb-4">Тест сторінки списку договорів</h1>
        <p>Якщо ви бачите це повідомлення, то роутинг для списку договорів працює правильно!</p>
        <div className="mt-4 space-y-2">
          <div className="p-4 border border-gray-200 rounded">
            <h3 className="font-semibold">Тестовий договір #1</h3>
            <p className="text-gray-600">Клієнт: Іван Петренко</p>
            <p className="text-gray-600">Маршрут: Київ → Львів</p>
          </div>
          <div className="p-4 border border-gray-200 rounded">
            <h3 className="font-semibold">Тестовий договір #2</h3>
            <p className="text-gray-600">Клієнт: Марія Іванова</p>
            <p className="text-gray-600">Маршрут: Одеса → Харків</p>
          </div>
        </div>
      </div>
    </div>
  );
}