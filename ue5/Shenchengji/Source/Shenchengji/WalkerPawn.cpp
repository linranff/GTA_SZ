#include "WalkerPawn.h"
#include "Camera/CameraComponent.h"
#include "Components/CapsuleComponent.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/SpringArmComponent.h"

AShenchengjiWalker::AShenchengjiWalker()
{
	PrimaryActorTick.bCanEverTick = true;
	bUseControllerRotationYaw = true;
	GetCharacterMovement()->MaxWalkSpeed = WalkSpeed;
	GetCharacterMovement()->NavAgentProps.bCanCrouch = false;
	GetCapsuleComponent()->SetCapsuleSize(23.f, 88.f);

	USpringArmComponent* Arm = CreateDefaultSubobject<USpringArmComponent>(TEXT("CameraArm"));
	Arm->SetupAttachment(RootComponent);
	Arm->TargetArmLength = 370.f;
	Arm->bUsePawnControlRotation = true;
	Arm->SetRelativeLocation(FVector(0.f, 0.f, 60.f));

	UCameraComponent* Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("FollowCamera"));
	Camera->SetupAttachment(Arm, USpringArmComponent::SocketName);
	Camera->bUsePawnControlRotation = false;
}

void AShenchengjiWalker::SetupPlayerInputComponent(UInputComponent* PlayerInputComponent)
{
	Super::SetupPlayerInputComponent(PlayerInputComponent);
	PlayerInputComponent->BindAxisKey(EKeys::MouseX, this, &AShenchengjiWalker::Turn);
	PlayerInputComponent->BindAxisKey(EKeys::MouseY, this, &AShenchengjiWalker::LookUp);
	PlayerInputComponent->BindKey(EKeys::LeftShift, IE_Pressed, this, &AShenchengjiWalker::StartRun);
	PlayerInputComponent->BindKey(EKeys::LeftShift, IE_Released, this, &AShenchengjiWalker::StopRun);
}

void AShenchengjiWalker::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	const FRotator Control = GetControlRotation();
	const FVector Forward = FRotationMatrix(FRotator(0.f, Control.Yaw, 0.f)).GetUnitAxis(EAxis::X);
	const FVector Right = FRotationMatrix(FRotator(0.f, Control.Yaw, 0.f)).GetUnitAxis(EAxis::Y);
	const APlayerController* Controller = Cast<APlayerController>(GetController());
	if (!Controller)
	{
		return;
	}
	if (Controller->IsInputKeyDown(EKeys::W) || Controller->IsInputKeyDown(EKeys::Up))
	{
		AddMovementInput(Forward, 1.f);
	}
	if (Controller->IsInputKeyDown(EKeys::S) || Controller->IsInputKeyDown(EKeys::Down))
	{
		AddMovementInput(Forward, -1.f);
	}
	if (Controller->IsInputKeyDown(EKeys::D) || Controller->IsInputKeyDown(EKeys::Right))
	{
		AddMovementInput(Right, 1.f);
	}
	if (Controller->IsInputKeyDown(EKeys::A) || Controller->IsInputKeyDown(EKeys::Left))
	{
		AddMovementInput(Right, -1.f);
	}
}

void AShenchengjiWalker::MoveForward(float Value)
{
	if (FMath::Abs(Value) > KINDA_SMALL_NUMBER)
	{
		AddMovementInput(FRotationMatrix(FRotator(0.f, GetControlRotation().Yaw, 0.f)).GetUnitAxis(EAxis::X), Value);
	}
}

void AShenchengjiWalker::MoveRight(float Value)
{
	if (FMath::Abs(Value) > KINDA_SMALL_NUMBER)
	{
		AddMovementInput(FRotationMatrix(FRotator(0.f, GetControlRotation().Yaw, 0.f)).GetUnitAxis(EAxis::Y), Value);
	}
}

void AShenchengjiWalker::Turn(float Value)
{
	AddControllerYawInput(Value);
}

void AShenchengjiWalker::LookUp(float Value)
{
	AddControllerPitchInput(-Value);
}

void AShenchengjiWalker::StartRun()
{
	GetCharacterMovement()->MaxWalkSpeed = RunSpeed;
}

void AShenchengjiWalker::StopRun()
{
	GetCharacterMovement()->MaxWalkSpeed = WalkSpeed;
}
