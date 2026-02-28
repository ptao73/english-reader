import random


def main():
    target = random.randint(1, 10)
    print("我已经想好了一个 1-10 的数字，来猜吧！")

    while True:
        user_input = input("请输入你的数字：").strip()

        if not user_input:
            print("请输入 1-10 之间的数字。")
            continue

        if not user_input.isdigit():
            print("请输入有效的整数。")
            continue

        guess = int(user_input)
        if guess < 1 or guess > 10:
            print("范围是 1-10，请重新输入。")
            continue

        if guess < target:
            print("猜小了，再试试。")
        elif guess > target:
            print("猜大了，再试试。")
        else:
            print(f"猜中了！答案是 {target}。")
            break


if __name__ == "__main__":
    main()
